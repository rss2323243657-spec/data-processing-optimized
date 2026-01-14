// 优化的数据存储类
class OptimizedDataStorage {
    constructor() {
        this.tables = new Map();
        this.fieldMappings = new Map();
        this.mappingIndex = new Map(); // 新增：映射索引
        this.descriptionTrie = {}; // 新增：前缀树
        this.cache = new Map(); // 新增：缓存
        this.memoryCache = new WeakMap(); // 新增：内存缓存
        
        // 性能监控
        this.metrics = {
            storageSize: 0,
            cacheHits: 0,
            cacheMisses: 0,
            indexHits: 0,
            indexMisses: 0
        };
        
        this.loadFromStorage();
        console.log('优化数据存储初始化完成');
    }
    
    loadFromStorage() {
        try {
            const saved = localStorage.getItem('dataStorage_optimized_v2');
            if (saved) {
                const data = JSON.parse(saved);
                if (data.tables && data.version === 'optimized_v2') {
                    // 使用增量加载，避免阻塞
                    this.loadIncremental(data);
                    console.log('从本地存储优化加载了', this.tables.size, '个表格');
                }
            }
        } catch (e) {
            console.log('加载存储数据失败，从头开始:', e);
            this.clearAll(); // 清理无效数据
        }
    }
    
    // 增量加载数据
    loadIncremental(data) {
        // 分批次加载，避免阻塞主线程
        const batchSize = 100;
        const tableEntries = data.tables;
        const mappingEntries = data.fieldMappings || [];
        
        // 使用requestIdleCallback进行后台加载
        if ('requestIdleCallback' in window) {
            this.loadTablesIncremental(tableEntries, batchSize);
            this.loadMappingsIncremental(mappingEntries, batchSize);
        } else {
            // 降级方案：直接加载
            this.tables = new Map(tableEntries);
            this.fieldMappings = new Map(mappingEntries);
            this.buildIndexes();
        }
    }
    
    loadTablesIncremental(entries, batchSize) {
        let index = 0;
        
        const loadBatch = () => {
            const end = Math.min(index + batchSize, entries.length);
            
            for (let i = index; i < end; i++) {
                const [key, value] = entries[i];
                this.tables.set(key, value);
            }
            
            index = end;
            
            if (index < entries.length) {
                requestIdleCallback(loadBatch);
            } else {
                console.log('表格增量加载完成');
            }
        };
        
        requestIdleCallback(loadBatch);
    }
    
    loadMappingsIncremental(entries, batchSize) {
        let index = 0;
        
        const loadBatch = () => {
            const end = Math.min(index + batchSize, entries.length);
            
            for (let i = index; i < end; i++) {
                const [key, value] = entries[i];
                this.fieldMappings.set(key, value);
                this.addToIndex(key, value);
            }
            
            index = end;
            
            if (index < entries.length) {
                requestIdleCallback(loadBatch);
            } else {
                console.log('映射增量加载完成');
                this.saveToStorage();
            }
        };
        
        requestIdleCallback(loadBatch);
    }
    
    saveToStorage() {
        try {
            // 只保存必要数据，减少存储大小
            const compactData = this.getCompactData();
            const data = {
                tables: compactData.tables,
                fieldMappings: compactData.mappings,
                version: 'optimized_v2',
                timestamp: new Date().toISOString(),
                metrics: this.metrics
            };
            
            // 使用防抖保存，避免频繁写入
            this.debouncedSave(data);
        } catch (e) {
            console.error('保存数据失败:', e);
        }
    }
    
    debouncedSave(data) {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        
        this.saveTimeout = setTimeout(() => {
            try {
                localStorage.setItem('dataStorage_optimized_v2', JSON.stringify(data));
            } catch (e) {
                console.error('保存到本地存储失败:', e);
                // 尝试清理空间
                this.clearOldData();
            }
        }, 1000);
    }
    
    getCompactData() {
        // 压缩表格数据
        const compactTables = [];
        this.tables.forEach((table, key) => {
            const compactTable = {
                id: table.id,
                name: table.name,
                originalName: table.originalName,
                // 只存储元数据，不存储大量数据
                columns: table.columns,
                rowCount: table.rowCount,
                createdAt: table.createdAt,
                metadata: table.metadata || {}
            };
            
            // 只有在需要时才存储数据
            if (table.isSmallTable || table.rowCount < 1000) {
                compactTable.data = table.data;
            }
            
            compactTables.push([key, compactTable]);
        });
        
        // 压缩映射数据
        const compactMappings = Array.from(this.fieldMappings.entries());
        
        return {
            tables: compactTables,
            mappings: compactMappings
        };
    }
    
    clearOldData() {
        // 清理30天前的数据
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const tablesToDelete = [];
        
        this.tables.forEach((table, key) => {
            if (new Date(table.createdAt).getTime() < thirtyDaysAgo) {
                tablesToDelete.push(key);
            }
        });
        
        tablesToDelete.forEach(key => this.tables.delete(key));
        
        console.log('清理了', tablesToDelete.length, '个旧表格');
        this.saveToStorage();
    }
    
    addTable(name, data, metadata = {}) {
        const tableId = 'table_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        // 自动重命名 ExportOrder 文件
        const originalName = name;
        if (name.toLowerCase().includes('exportorder')) {
            const today = new Date();
            const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
            name = `速猫订单${dateStr}`;
            
            // 检查是否已存在同名表格，如果存在则添加后缀
            let suffix = 1;
            let finalName = name;
            while (Array.from(this.tables.values()).some(t => t.name === finalName)) {
                finalName = `${name}_${suffix}`;
                suffix++;
            }
            name = finalName;
        }
        
        // 优化数据存储
        const optimizedData = this.optimizeData(data);
        
        const tableData = {
            id: tableId,
            name: name,
            originalName: originalName,
            data: optimizedData,
            columns: data.length > 0 ? Object.keys(data[0]) : [],
            rowCount: data.length,
            createdAt: new Date().toISOString(),
            isSmallTable: data.length < 1000,
            ...metadata
        };
        
        this.tables.set(tableId, tableData);
        this.saveToStorage();
        
        console.log('添加优化表格:', name, 'ID:', tableId, '行数:', data.length);
        return tableId;
    }
    
    optimizeData(data) {
        if (!data || data.length === 0) return data;
        
        // 使用TypedArray存储数字
        const optimizedData = [];
        const firstRow = data[0];
        
        data.forEach(row => {
            const optimizedRow = {};
            
            Object.keys(row).forEach(key => {
                const value = row[key];
                
                // 尝试转换为数字
                if (typeof value === 'string' && !isNaN(value) && value.trim() !== '') {
                    const num = Number(value);
                    if (!isNaN(num) && isFinite(num)) {
                        optimizedRow[key] = num % 1 === 0 ? parseInt(value) : num;
                    } else {
                        optimizedRow[key] = value;
                    }
                } else {
                    optimizedRow[key] = value;
                }
            });
            
            optimizedData.push(optimizedRow);
        });
        
        return optimizedData;
    }
    
    // 构建索引
    buildIndexes() {
        console.time('buildIndexes');
        
        this.mappingIndex.clear();
        this.descriptionTrie = {};
        this.metrics.indexHits = 0;
        this.metrics.indexMisses = 0;
        
        this.fieldMappings.forEach((mapping, key) => {
            this.addToIndex(key, mapping);
        });
        
        console.timeEnd('buildIndexes');
        console.log('索引构建完成，共', this.fieldMappings.size, '个映射');
    }
    
    addToIndex(key, mapping) {
        // 添加到哈希索引
        this.mappingIndex.set(key, mapping);
        
        // 添加到前缀树
        const [desc, type] = key.split('|');
        if (desc) {
            this.addToTrie(desc.toLowerCase(), key);
        }
    }
    
    addToTrie(word, key) {
        let node = this.descriptionTrie;
        
        for (const char of word) {
            if (!node[char]) {
                node[char] = {};
            }
            node = node[char];
        }
        
        if (!node.keys) {
            node.keys = [];
        }
        node.keys.push(key);
    }
    
    // 智能匹配字段（使用索引）
    autoMatchField(transactionDesc, amountType) {
        const key = `${transactionDesc}|${amountType}`;
        
        // 检查缓存
        const cacheKey = `match_${key}`;
        if (this.cache.has(cacheKey)) {
            this.metrics.cacheHits++;
            return this.cache.get(cacheKey);
        }
        
        // 1. 完全匹配
        if (this.mappingIndex.has(key)) {
            this.metrics.indexHits++;
            const mapping = this.mappingIndex.get(key);
            this.cache.set(cacheKey, mapping);
            return mapping;
        }
        
        // 2. 仅Transaction Desc匹配
        const descMatches = this.findInTrie(transactionDesc.toLowerCase());
        if (descMatches.length > 0) {
            this.metrics.indexHits++;
            // 找到第一个匹配的映射
            for (const matchKey of descMatches) {
                const mapping = this.fieldMappings.get(matchKey);
                if (mapping) {
                    this.cache.set(cacheKey, mapping);
                    return mapping;
                }
            }
        }
        
        // 3. 前缀匹配
        const prefixMatches = this.findPrefixMatches(transactionDesc.toLowerCase());
        if (prefixMatches.length > 0) {
            this.metrics.indexHits++;
            const mapping = this.fieldMappings.get(prefixMatches[0]);
            if (mapping) {
                this.cache.set(cacheKey, mapping);
                return mapping;
            }
        }
        
        this.metrics.indexMisses++;
        this.metrics.cacheMisses++;
        return null;
    }
    
    findInTrie(word) {
        let node = this.descriptionTrie;
        const result = [];
        
        for (const char of word) {
            if (!node[char]) {
                return result;
            }
            node = node[char];
        }
        
        this.collectKeys(node, result);
        return result;
    }
    
    findPrefixMatches(prefix) {
        const matches = [];
        let node = this.descriptionTrie;
        
        for (const char of prefix) {
            if (!node[char]) {
                return matches;
            }
            node = node[char];
        }
        
        this.collectKeys(node, matches);
        return matches;
    }
    
    collectKeys(node, result) {
        if (node.keys) {
            result.push(...node.keys);
        }
        
        for (const char in node) {
            if (char !== 'keys') {
                this.collectKeys(node[char], result);
            }
        }
    }
    
    saveFieldMapping(mappingKey, mappingData) {
        this.fieldMappings.set(mappingKey, mappingData);
        this.addToIndex(mappingKey, mappingData);
        this.cache.delete(`match_${mappingKey}`); // 清除缓存
        
        // 延迟保存到存储
        setTimeout(() => this.saveToStorage(), 100);
    }
    
    getFieldMapping(mappingKey) {
        return this.fieldMappings.get(mappingKey);
    }
    
    getAllFieldMappings() {
        return Array.from(this.fieldMappings.entries());
    }
    
    getAllTables() {
        return Array.from(this.tables.values());
    }
    
    getTable(tableId) {
        const table = this.tables.get(tableId);
        
        // 如果表格数据被压缩了，需要重新加载
        if (table && !table.data && table.metadata && table.metadata.sourceTable) {
            // 从源表格重新加载数据
            const sourceTable = this.tables.get(table.metadata.sourceTable);
            if (sourceTable && sourceTable.data) {
                // 这里需要根据metadata重新计算数据
                // 简化处理：返回空数组
                table.data = [];
            }
        }
        
        return table;
    }
    
    getTablesByType(type) {
        const tables = this.getAllTables();
        if (type === 'zip') {
            return tables.filter(table => table.isZip || (table.originalName && table.originalName.includes('.zip')));
        } else if (type === 'exportorder') {
            return tables.filter(table => 
                table.name.includes('速猫订单') || 
                (table.originalName && table.originalName.toLowerCase().includes('exportorder'))
            );
        } else if (type === 'bill') {
            return tables.filter(table => 
                table.name.includes('账单') && !table.name.includes('账单汇总') && !table.name.includes('已处理')
            );
        } else if (type === 'bill_summary') {
            return tables.filter(table => 
                table.name.includes('账单汇总') && !table.name.includes('已处理')
            );
        } else if (type === 'processed') {
            return tables.filter(table => 
                table.name.includes('已处理')
            );
        } else if (type === 'matched_time') {
            return tables.filter(table => 
                table.name.includes('下单时间匹配') || table.name.includes('匹配表')
            );
        } else if (type === 'matched_bill') {
            return tables.filter(table => 
                table.name.includes('账单订单匹配') && table.name.includes('新生成')
            );
        } else if (type === 'summary') {
            return tables.filter(table => 
                table.name.includes('数据汇总') || table.name.includes('筛选-')
            );
        }
        return tables;
    }
    
    getBillTablesSortedByDate() {
        const billTables = this.getTablesByType('bill');
        
        // 提取日期并排序
        const datedTables = billTables.map(table => {
            let dateRange = null;
            let startDate = null;
            
            // 尝试从文件名中提取日期范围
            const dateMatch = table.name.match(/(\d{1,2})\.(\d{1,2})-(\d{1,2})\.(\d{1,2})/);
            if (dateMatch) {
                const month1 = parseInt(dateMatch[1]);
                const day1 = parseInt(dateMatch[2]);
                const month2 = parseInt(dateMatch[3]);
                const day2 = parseInt(dateMatch[4]);
                
                // 创建日期对象用于排序（假设当前年份）
                const currentYear = new Date().getFullYear();
                startDate = new Date(currentYear, month1 - 1, day1);
                dateRange = `${month1}.${day1}-${month2}.${day2}`;
            }
            
            return {
                table: table,
                dateRange: dateRange,
                startDate: startDate
            };
        });
        
        // 按开始日期排序
        datedTables.sort((a, b) => {
            if (a.startDate && b.startDate) {
                return a.startDate - b.startDate;
            }
            if (a.startDate) return -1;
            if (b.startDate) return 1;
            
            // 如果无法提取日期，按名称排序
            return a.table.name.localeCompare(b.table.name);
        });
        
        return datedTables.map(item => item.table);
    }
    
    getBillSummaryTables() {
        return this.getAllTables().filter(table => 
            table.name.includes('账单汇总')
        );
    }
    
    getMatchedTimeTables() {
        return this.getAllTables().filter(table => 
            table.name.includes('下单时间匹配') || 
            (table.columns && 
             table.columns.includes('Purchase Order #') && 
             table.columns.includes('匹配下单时间'))
        );
    }
    
    getMatchedBillTables() {
        return this.getAllTables().filter(table => 
            table.name.includes('账单订单匹配') && table.name.includes('新生成')
        );
    }
    
    deleteTable(tableId) {
        this.tables.delete(tableId);
        this.saveToStorage();
    }
    
    clearAll() {
        this.tables.clear();
        this.fieldMappings.clear();
        this.mappingIndex.clear();
        this.descriptionTrie = {};
        this.cache.clear();
        localStorage.removeItem('dataStorage_optimized_v2');
        console.log('所有数据已清空');
    }
    
    // 压缩表格数据
    compactTable(tableId) {
        const table = this.getTable(tableId);
        if (!table) return false;
        
        if (table.data && table.data.length > 1000) {
            // 只保留元数据，不保留大数据
            table.data = undefined;
            table.isCompressed = true;
            table.compressedAt = new Date().toISOString();
            
            this.tables.set(tableId, table);
            this.saveToStorage();
            
            console.log('表格已压缩:', table.name);
            return true;
        }
        
        return false;
    }
    
    // 解压缩表格数据
    decompressTable(tableId) {
        const table = this.getTable(tableId);
        if (!table || !table.isCompressed) return false;
        
        // 在实际应用中，这里需要从原始源重新加载数据
        // 简化处理：返回false
        return false;
    }
    
    // 获取索引数量
    getIndexCount() {
        return this.mappingIndex.size;
    }
    
    // 获取缓存命中率
    getCacheHitRate() {
        const total = this.metrics.cacheHits + this.metrics.cacheMisses;
        return total > 0 ? Math.round((this.metrics.cacheHits / total) * 100) : 0;
    }
    
    // 获取索引命中率
    getIndexHitRate() {
        const total = this.metrics.indexHits + this.metrics.indexMisses;
        return total > 0 ? Math.round((this.metrics.indexHits / total) * 100) : 0;
    }
}