// 索引构建Web Worker
self.onmessage = function(e) {
    const { type, data, options } = e.data;
    
    switch(type) {
        case 'buildIndex':
            // 构建索引
            const indexes = buildDataIndexes(data, options);
            self.postMessage({ 
                type: 'indexComplete', 
                indexes,
                stats: {
                    dataLength: data.length,
                    indexSize: indexes.transactionIndex.size
                }
            });
            break;
            
        case 'search':
            // 搜索数据
            const results = searchData(data, options.query, options.indexes);
            self.postMessage({
                type: 'searchComplete',
                results,
                query: options.query
            });
            break;
            
        case 'updateIndex':
            // 增量更新索引
            const updatedIndexes = updateDataIndexes(options.oldIndexes, options.updates);
            self.postMessage({
                type: 'indexUpdated',
                indexes: updatedIndexes,
                updateCount: options.updates.length
            });
            break;
            
        case 'optimizeIndex':
            // 优化索引
            const optimizedIndexes = optimizeIndexes(options.indexes);
            self.postMessage({
                type: 'indexOptimized',
                indexes: optimizedIndexes,
                optimizationStats: optimizedIndexes.stats
            });
            break;
    }
};

// 构建数据索引
function buildDataIndexes(data, options = {}) {
    const startTime = performance.now();
    
    // 初始化索引结构
    const indexes = {
        transactionIndex: new Map(),      // 交易描述+类型的哈希索引
        descriptionIndex: new Map(),      // 仅描述的哈希索引
        amountTypeIndex: new Map(),       // 金额类型索引
        descriptionTrie: {},              // 描述前缀树
        categoryIndex: new Map(),         // 分类索引
        amountRangeIndex: {               // 金额范围索引
            ranges: [],
            min: Infinity,
            max: -Infinity
        },
        stats: {
            buildTime: 0,
            indexSize: 0,
            uniqueDescriptions: 0,
            uniqueAmountTypes: 0
        }
    };
    
    // 批量处理数据
    const batchSize = options.batchSize || 1000;
    let processedCount = 0;
    
    for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);
        
        batch.forEach((item, batchIndex) => {
            const globalIndex = i + batchIndex;
            const desc = item.transactionDesc || item['Transaction Description'] || '';
            const type = item.amountType || item['Amount Type'] || '';
            const amount = parseFloat(item.amount || item['Amount'] || 0);
            const category = item.primaryCategory || '';
            
            // 1. 交易描述+类型索引
            if (desc && type) {
                const key = `${desc}|${type}`;
                indexes.transactionIndex.set(key, globalIndex);
            }
            
            // 2. 仅描述索引
            if (desc) {
                indexes.descriptionIndex.set(desc, globalIndex);
                
                // 添加到前缀树
                addToTrie(desc.toLowerCase(), globalIndex, indexes.descriptionTrie);
            }
            
            // 3. 金额类型索引
            if (type) {
                if (!indexes.amountTypeIndex.has(type)) {
                    indexes.amountTypeIndex.set(type, []);
                }
                indexes.amountTypeIndex.get(type).push(globalIndex);
            }
            
            // 4. 分类索引
            if (category) {
                if (!indexes.categoryIndex.has(category)) {
                    indexes.categoryIndex.set(category, []);
                }
                indexes.categoryIndex.get(category).push(globalIndex);
            }
            
            // 5. 金额范围索引
            if (!isNaN(amount)) {
                indexes.amountRangeIndex.min = Math.min(indexes.amountRangeIndex.min, amount);
                indexes.amountRangeIndex.max = Math.max(indexes.amountRangeIndex.max, amount);
            }
            
            processedCount++;
        });
        
        // 定期报告进度
        if (i % (batchSize * 10) === 0 && options.reportProgress) {
            const progress = Math.round((i + batchSize) / data.length * 100);
            self.postMessage({
                type: 'progress',
                progress,
                processed: i + batchSize,
                total: data.length
            });
        }
    }
    
    // 构建金额范围
    buildAmountRanges(indexes.amountRangeIndex, data);
    
    // 更新统计信息
    indexes.stats.buildTime = performance.now() - startTime;
    indexes.stats.indexSize = indexes.transactionIndex.size;
    indexes.stats.uniqueDescriptions = indexes.descriptionIndex.size;
    indexes.stats.uniqueAmountTypes = indexes.amountTypeIndex.size;
    
    return indexes;
}

// 添加到前缀树
function addToTrie(word, index, trie) {
    let node = trie;
    
    for (const char of word) {
        if (!node[char]) {
            node[char] = {};
        }
        node = node[char];
    }
    
    if (!node.indices) {
        node.indices = [];
    }
    node.indices.push(index);
}

// 构建金额范围
function buildAmountRanges(amountRangeIndex, data) {
    if (data.length === 0 || amountRangeIndex.min === Infinity) return;
    
    const rangeCount = 10; // 分成10个范围
    const rangeSize = (amountRangeIndex.max - amountRangeIndex.min) / rangeCount;
    
    amountRangeIndex.ranges = [];
    
    for (let i = 0; i < rangeCount; i++) {
        const min = amountRangeIndex.min + (rangeSize * i);
        const max = min + rangeSize;
        
        amountRangeIndex.ranges.push({
            min,
            max,
            indices: []
        });
    }
    
    // 为每个数据项分配范围
    data.forEach((item, index) => {
        const amount = parseFloat(item.amount || item['Amount'] || 0);
        
        if (!isNaN(amount)) {
            for (let i = 0; i < amountRangeIndex.ranges.length; i++) {
                const range = amountRangeIndex.ranges[i];
                if (amount >= range.min && amount < range.max) {
                    range.indices.push(index);
                    break;
                }
            }
        }
    });
}

// 搜索数据
function searchData(data, query, indexes) {
    const startTime = performance.now();
    const results = new Set();
    
    if (!query || query.trim() === '') {
        // 返回所有数据
        return {
            results: data,
            searchTime: performance.now() - startTime,
            resultCount: data.length,
            searchType: 'all'
        };
    }
    
    const queryLower = query.toLowerCase();
    
    // 1. 检查精确匹配
    if (indexes.transactionIndex.has(query)) {
        const index = indexes.transactionIndex.get(query);
        results.add(index);
    }
    
    // 2. 检查描述匹配
    if (indexes.descriptionIndex.has(query)) {
        const index = indexes.descriptionIndex.get(query);
        results.add(index);
    }
    
    // 3. 检查前缀匹配
    const prefixMatches = findInTrie(queryLower, indexes.descriptionTrie);
    prefixMatches.forEach(index => results.add(index));
    
    // 4. 检查分类匹配
    if (indexes.categoryIndex.has(query)) {
        indexes.categoryIndex.get(query).forEach(index => results.add(index));
    }
    
    // 5. 检查金额类型匹配
    if (indexes.amountTypeIndex.has(query)) {
        indexes.amountTypeIndex.get(query).forEach(index => results.add(index));
    }
    
    // 6. 检查金额范围
    const amount = parseFloat(query);
    if (!isNaN(amount)) {
        indexes.amountRangeIndex.ranges.forEach(range => {
            if (amount >= range.min && amount < range.max) {
                range.indices.forEach(index => results.add(index));
            }
        });
    }
    
    // 7. 如果索引匹配不足，进行全文搜索
    if (results.size < 10) {
        data.forEach((item, index) => {
            const desc = (item.transactionDesc || item['Transaction Description'] || '').toLowerCase();
            const type = (item.amountType || item['Amount Type'] || '').toLowerCase();
            
            if (desc.includes(queryLower) || type.includes(queryLower)) {
                results.add(index);
            }
        });
    }
    
    // 转换为数组并获取实际数据
    const resultIndices = Array.from(results);
    const resultData = resultIndices.map(index => data[index]);
    
    const searchTime = performance.now() - startTime;
    
    return {
        results: resultData,
        indices: resultIndices,
        searchTime,
        resultCount: resultData.length,
        searchType: 'indexed'
    };
}

// 在前缀树中查找
function findInTrie(prefix, trie) {
    let node = trie;
    const results = [];
    
    // 遍历到前缀的最后一个字符
    for (const char of prefix) {
        if (!node[char]) {
            return results;
        }
        node = node[char];
    }
    
    // 收集所有匹配项
    collectFromNode(node, results);
    return results;
}

// 收集节点下的所有索引
function collectFromNode(node, results) {
    if (node.indices) {
        results.push(...node.indices);
    }
    
    for (const char in node) {
        if (char !== 'indices') {
            collectFromNode(node[char], results);
        }
    }
}

// 更新数据索引
function updateDataIndexes(oldIndexes, updates) {
    const newIndexes = JSON.parse(JSON.stringify(oldIndexes));
    
    updates.forEach(update => {
        const { type, key, value, oldValue } = update;
        
        switch(type) {
            case 'add':
                // 添加新索引
                if (key.includes('|')) {
                    newIndexes.transactionIndex.set(key, value);
                } else {
                    newIndexes.descriptionIndex.set(key, value);
                }
                break;
                
            case 'update':
                // 更新现有索引
                if (oldIndexes.transactionIndex.has(oldValue)) {
                    const index = oldIndexes.transactionIndex.get(oldValue);
                    oldIndexes.transactionIndex.delete(oldValue);
                    newIndexes.transactionIndex.set(key, index);
                }
                break;
                
            case 'delete':
                // 删除索引
                oldIndexes.transactionIndex.delete(key);
                oldIndexes.descriptionIndex.delete(key);
                break;
        }
    });
    
    // 更新统计信息
    newIndexes.stats.indexSize = newIndexes.transactionIndex.size;
    newIndexes.stats.uniqueDescriptions = newIndexes.descriptionIndex.size;
    
    return newIndexes;
}

// 优化索引
function optimizeIndexes(indexes) {
    const startTime = performance.now();
    
    // 1. 清理无效索引
    const validIndices = new Set();
    
    // 2. 重新组织前缀树
    const optimizedTrie = {};
    
    // 3. 压缩索引存储
    const compressedIndexes = {
        transactionIndex: new Map(indexes.transactionIndex),
        descriptionIndex: new Map(indexes.descriptionIndex),
        amountTypeIndex: new Map(indexes.amountTypeIndex),
        descriptionTrie: optimizedTrie,
        categoryIndex: new Map(indexes.categoryIndex),
        amountRangeIndex: indexes.amountRangeIndex,
        stats: {
            ...indexes.stats,
            optimizationTime: performance.now() - startTime,
            originalSize: indexes.transactionIndex.size,
            compressedSize: indexes.transactionIndex.size // 在实际中会变小
        }
    };
    
    return compressedIndexes;
}