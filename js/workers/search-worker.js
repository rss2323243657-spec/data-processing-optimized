// 搜索Web Worker
self.onmessage = function(e) {
    const { type, data, searchTerm, indexes } = e.data;
    
    if (type === 'search') {
        const startTime = performance.now();
        
        let results;
        
        if (searchTerm && indexes) {
            // 使用索引搜索
            results = searchWithIndexes(data, searchTerm, indexes);
        } else if (searchTerm) {
            // 普通搜索
            results = data.filter(item => 
                item.transactionDesc.toLowerCase().includes(searchTerm) ||
                (item.amountType && item.amountType.toLowerCase().includes(searchTerm))
            );
        } else {
            results = data;
        }
        
        const searchTime = performance.now() - startTime;
        
        self.postMessage({
            results,
            searchTime,
            searchTerm,
            resultCount: results.length
        });
    } else if (type === 'buildIndex') {
        // 构建索引
        const indexes = buildIndexes(data);
        self.postMessage({
            type: 'indexComplete',
            indexes,
            dataLength: data.length
        });
    }
};

// 构建索引
function buildIndexes(data) {
    const startTime = performance.now();
    
    const transactionIndex = new Map();
    const descriptionTrie = {};
    
    data.forEach((item, index) => {
        const desc = item.transactionDesc || '';
        const type = item.amountType || '';
        const key = `${desc}|${type}`;
        
        // 添加到哈希索引
        transactionIndex.set(key, index);
        
        // 添加到前缀树
        if (desc) {
            addToTrie(desc.toLowerCase(), index, descriptionTrie);
        }
    });
    
    const buildTime = performance.now() - startTime;
    
    return {
        transactionIndex,
        descriptionTrie,
        buildTime,
        indexSize: transactionIndex.size
    };
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

// 使用索引搜索
function searchWithIndexes(data, searchTerm, indexes) {
    const { transactionIndex, descriptionTrie } = indexes;
    const results = [];
    const visited = new Set();
    
    // 1. 完全匹配
    if (transactionIndex.has(searchTerm)) {
        const index = transactionIndex.get(searchTerm);
        if (!visited.has(index)) {
            results.push(data[index]);
            visited.add(index);
        }
    }
    
    // 2. 前缀匹配
    const prefixMatches = findInTrie(searchTerm.toLowerCase(), descriptionTrie);
    prefixMatches.forEach(index => {
        if (!visited.has(index)) {
            results.push(data[index]);
            visited.add(index);
        }
    });
    
    // 3. 如果索引匹配不足，使用普通搜索补充
    if (results.length < 10) {
        data.forEach((item, index) => {
            if (visited.has(index)) return;
            
            if (item.transactionDesc.toLowerCase().includes(searchTerm.toLowerCase())) {
                results.push(item);
                visited.add(index);
            }
        });
    }
    
    return results;
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