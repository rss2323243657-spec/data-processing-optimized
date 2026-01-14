// 优化的数据处理引擎
class OptimizedDataProcessor {
    constructor(storage) {
        this.storage = storage;
        this.ignoredCategories = new Set();
        this.mappingCache = new Map();
        this.compiledRules = null;
        this.performanceMetrics = {
            totalProcessed: 0,
            batchProcessingTime: 0,
            averageLookupTime: 0
        };
        
        console.log('优化数据处理引擎初始化');
    }
    
    // 1. 数据筛选（优化版）
    filterTable(tableId, selectedColumns) {
        console.time('filterTable');
        const table = this.storage.getTable(tableId);
        if (!table || !table.data) {
            throw new Error('无效的表格数据');
        }
        
        // 使用TypedArray存储数字列
        const filteredData = [];
        const numericColumns = new Set(['Amount', 'amount', '金额']);
        
        table.data.forEach(row => {
            const newRow = {};
            selectedColumns.forEach(col => {
                const value = row[col] || '';
                
                // 优化数字存储
                if (numericColumns.has(col) && typeof value === 'string') {
                    const num = parseFloat(value);
                    newRow[col] = isNaN(num) ? value : num;
                } else {
                    newRow[col] = value;
                }
            });
            filteredData.push(newRow);
        });
        
        console.timeEnd('filterTable');
        
        return {
            name: `${table.name}_已筛选`,
            data: filteredData,
            columns: selectedColumns,
            rowCount: filteredData.length,
            originalSize: table.data.length
        };
    }
    
    // 2. 智能账单合并（优化版）
    mergeBillTables(billTableIds) {
        console.time('mergeBillTables');
        
        if (!billTableIds || billTableIds.length === 0) {
            throw new Error('请选择要合并的账单表格');
        }
        
        const billTables = billTableIds.map(id => this.storage.getTable(id)).filter(t => t);
        
        if (billTables.length === 0) {
            throw new Error('没有找到有效的账单表格');
        }
        
        // 按日期排序
        const sortedTables = this.sortTablesByDate(billTables);
        const firstTable = sortedTables[0];
        const columnStructure = firstTable.columns;
        
        // 使用流式合并
        const { transactionKeyRows, nonTransactionKeyRows } = this.mergeTablesStreaming(sortedTables);
        
        // 合并所有行
        const mergedData = [...nonTransactionKeyRows, ...transactionKeyRows];
        
        console.timeEnd('mergeBillTables');
        
        return {
            name: this.generateMergedTableName(sortedTables),
            data: mergedData,
            columns: columnStructure,
            rowCount: mergedData.length,
            sourceTables: sortedTables.map(t => t.id),
            transactionKeyRows: transactionKeyRows.length,
            nonTransactionKeyRows: nonTransactionKeyRows.length
        };
    }
    
    mergeTablesStreaming(tables) {
        const transactionKeyRows = [];
        const nonTransactionKeyRows = [];
        
        tables.forEach((table, tableIndex) => {
            const { transactionRows, nonTransactionRows } = this.separateRowsByTransactionKey(table.data);
            
            if (tableIndex === 0) {
                transactionKeyRows.push(...transactionRows);
                nonTransactionKeyRows.push(...nonTransactionRows);
            } else {
                // 后续表格智能插入
                const insertPosition = nonTransactionKeyRows.length;
                nonTransactionKeyRows.splice(insertPosition, 0, ...nonTransactionRows);
                transactionKeyRows.push(...transactionRows);
            }
            
            // 释放内存
            table.data = null;
        });
        
        return { transactionKeyRows, nonTransactionKeyRows };
    }
    
    separateRowsByTransactionKey(data) {
        const transactionRows = [];
        const nonTransactionRows = [];
        
        data.forEach(row => {
            const transactionKey = this.findTransactionKeyValue(row);
            
            if (transactionKey && transactionKey !== '' && transactionKey !== '#N/A') {
                transactionRows.push(row);
            } else {
                nonTransactionRows.push(row);
            }
        });
        
        return { transactionRows, nonTransactionRows };
    }
    
    // 3. VLOOKUP订单时间匹配（优化版）
    async vlookupOrderTimeMatch(orderTableId, orderNumberField, orderTimeField, 
                              billTableId, purchaseOrderField) {
        console.time('vlookupOrderTimeMatch');
        
        const orderTable = this.storage.getTable(orderTableId);
        const billTable = this.storage.getTable(billTableId);
        
        if (!orderTable || !billTable) {
            throw new Error('无效的表格数据');
        }
        
        // 1. 构建哈希索引（O(1)查找）
        const orderTimeMap = new Map();
        const orderCountMap = new Map();
        
        orderTable.data.forEach(row => {
            const orderNumber = row[orderNumberField];
            const orderTime = row[orderTimeField];
            
            if (orderNumber !== undefined && orderNumber !== null && orderNumber !== '') {
                const orderNumberStr = String(orderNumber).trim();
                const formattedTime = this.formatDateForDisplay(orderTime);
                
                orderCountMap.set(orderNumberStr, (orderCountMap.get(orderNumberStr) || 0) + 1);
                
                if (!orderTimeMap.has(orderNumberStr)) {
                    orderTimeMap.set(orderNumberStr, formattedTime);
                }
            }
        });
        
        console.log(`哈希索引构建完成: ${orderTimeMap.size} 个唯一订单号`);
        
        // 2. 批量匹配（使用分组）
        const matchedData = [];
        let matchCount = 0;
        let noMatchCount = 0;
        
        // 按Purchase Order分组
        const purchaseOrderGroups = new Map();
        
        billTable.data.forEach((row, rowIndex) => {
            const purchaseOrder = row[purchaseOrderField];
            
            if (purchaseOrder !== undefined && purchaseOrder !== null && purchaseOrder !== '') {
                const purchaseOrderStr = String(purchaseOrder).trim();
                
                if (!purchaseOrderGroups.has(purchaseOrderStr)) {
                    purchaseOrderGroups.set(purchaseOrderStr, []);
                }
                purchaseOrderGroups.get(purchaseOrderStr).push({ row, rowIndex });
            }
        });
        
        // 批量处理每组
        purchaseOrderGroups.forEach((rows, purchaseOrderStr) => {
            const matchedTime = orderTimeMap.get(purchaseOrderStr);
            
            rows.forEach(({ row, rowIndex }) => {
                const matchedRow = {
                    'Purchase Order #': purchaseOrderStr,
                    '匹配下单时间': matchedTime || '#N/A',
                    '匹配状态': matchedTime ? '已匹配' : '未匹配',
                    '数据来源': '账单汇总表',
                    '原始行号': rowIndex + 2,
                    '订单出现次数': orderCountMap.get(purchaseOrderStr) || 0
                };
                
                if (matchedTime) {
                    matchCount++;
                } else {
                    noMatchCount++;
                }
                
                matchedData.push(matchedRow);
            });
        });
        
        console.timeEnd('vlookupOrderTimeMatch');
        
        return {
            name: `下单时间匹配-${new Date().toISOString().slice(0, 10)}`,
            data: matchedData,
            columns: ['Purchase Order #', '匹配下单时间', '匹配状态', '数据来源', '原始行号', '订单出现次数'],
            rowCount: matchedData.length,
            matchCount,
            noMatchCount,
            orderTable: orderTable.name,
            billTable: billTable.name
        };
    }
    
    // 4. 合并下单时间到账单汇总表（优化版）
    mergeMatchedTimeToBill(billTableId, matchedTableId) {
        console.time('mergeMatchedTimeToBill');
        
        const billTable = this.storage.getTable(billTableId);
        const matchedTable = this.storage.getTable(matchedTableId);
        
        if (!billTable || !matchedTable) {
            throw new Error('无效的表格数据');
        }
        
        // 构建匹配映射
        const matchedMap = new Map();
        matchedTable.data.forEach(row => {
            const purchaseOrder = row['Purchase Order #'];
            const matchedTime = row['匹配下单时间'];
            if (purchaseOrder && purchaseOrder !== '#N/A' && matchedTime && matchedTime !== '#N/A') {
                matchedMap.set(purchaseOrder.toString().trim(), matchedTime);
            }
        });
        
        // 批量处理账单数据
        const newData = [];
        let timestampFilledCount = 0;
        let matchedCount = 0;
        
        // 第一步：基础填充
        billTable.data.forEach((billRow, i) => {
            const newRow = {};
            const transactionKey = this.findTransactionKeyValue(billRow);
            const isTransactionKeyEmpty = this.isTransactionKeyEmpty(transactionKey);
            const timestamp = this.findTransactionTimestamp(billRow);
            
            let orderTimeValue = '';
            
            if (isTransactionKeyEmpty && timestamp) {
                orderTimeValue = this.forceDateFormat(timestamp);
                timestampFilledCount++;
            }
            
            newRow['下单时间'] = orderTimeValue;
            Object.keys(billRow).forEach(key => {
                newRow[key] = billRow[key];
            });
            
            newData.push(newRow);
        });
        
        // 第二步：匹配覆盖
        newData.forEach((row, i) => {
            const purchaseOrder = this.extractPurchaseOrder(row);
            
            if (purchaseOrder && matchedMap.has(purchaseOrder)) {
                const matchedTime = matchedMap.get(purchaseOrder);
                const formattedTime = this.forceDateFormat(matchedTime);
                
                if (row['下单时间'] !== formattedTime) {
                    if (row['下单时间'] !== '') {
                        timestampFilledCount--;
                    }
                    newData[i]['下单时间'] = formattedTime;
                    matchedCount++;
                }
            }
        });
        
        const newColumns = ['下单时间', ...billTable.columns];
        
        console.timeEnd('mergeMatchedTimeToBill');
        
        return {
            name: this.generateFinalTableName(billTable.name),
            data: newData,
            columns: newColumns,
            rowCount: newData.length,
            matchedCount,
            timestampFilledCount,
            noDataCount: newData.length - matchedCount - timestampFilledCount
        };
    }
    
    // 5. 按日期筛选数据（优化版）
    async filterByDate(tableId, year, month, day) {
        console.time('filterByDate');
        
        const table = this.storage.getTable(tableId);
        if (!table || !table.data) {
            throw new Error('无效的表格数据');
        }
        
        const dateColumn = this.findDateColumn(table.data[0]);
        if (!dateColumn) {
            throw new Error('找不到下单时间列');
        }
        
        // 使用流式筛选
        const filteredData = [];
        const batchSize = 1000;
        
        for (let i = 0; i < table.data.length; i += batchSize) {
            const batch = table.data.slice(i, i + batchSize);
            
            batch.forEach(row => {
                const dateValue = row[dateColumn];
                if (!dateValue) return;
                
                const date = this.parseDate(dateValue);
                if (!date) return;
                
                let match = true;
                
                if (year && date.getFullYear().toString() !== year) {
                    match = false;
                }
                
                if (month && (date.getMonth() + 1).toString() !== month) {
                    match = false;
                }
                
                if (day && date.getDate().toString() !== day) {
                    match = false;
                }
                
                if (match) {
                    const filteredRow = { ...row };
                    filteredRow._originalIndex = i;
                    filteredData.push(filteredRow);
                }
            });
            
            // 让出主线程，避免阻塞
            if (i % (batchSize * 10) === 0) {
                await this.yieldToMainThread();
            }
        }
        
        console.timeEnd('filterByDate');
        
        return {
            name: this.generateFilteredTableName(year, month, day),
            filteredData,
            dateColumn,
            filterConditions: { year, month, day },
            originalRowCount: table.data.length,
            filteredRowCount: filteredData.length
        };
    }
    
    // 6. 生成最终汇总表（优化版）
    generateFinalSummaryTable(data, fieldMappings = {}, manualInputs = {}) {
        console.time('generateFinalSummaryTable');
        
        if (!data || data.length === 0) {
            throw new Error('没有数据可以汇总');
        }
        
        // 预编译映射规则
        if (!this.compiledRules) {
            this.compiledRules = this.compileMappingRules();
        }
        
        // 初始化分类
        const primaryCategories = this.initializePrimaryCategories();
        
        let processedRows = 0;
        let ignoredRows = 0;
        
        // 批量处理数据
        const batchSize = 1000;
        for (let i = 0; i < data.length; i += batchSize) {
            const batch = data.slice(i, i + batchSize);
            
            batch.forEach(row => {
                const transactionDesc = row['Transaction Description'] || 
                                       row['Transaction_Description'] || 
                                       row['transaction_description'] || '';
                const amountType = row['Amount Type'] || 
                                  row['Amount_Type'] || 
                                  row['amount_type'] || 
                                  row['Type'] || '';
                const amount = parseFloat(row['Amount'] || row['amount'] || 0) || 0;
                
                if (!transactionDesc || transactionDesc.trim() === '') {
                    return;
                }
                
                processedRows++;
                
                // 查找映射关系（使用缓存）
                let primaryCategory = '';
                let subcategoryName = transactionDesc;
                
                const mappingKey = `${transactionDesc}|${amountType}`;
                if (fieldMappings[mappingKey]) {
                    primaryCategory = fieldMappings[mappingKey].primaryCategory;
                    subcategoryName = fieldMappings[mappingKey].subcategoryName || transactionDesc;
                } else if (this.mappingCache.has(mappingKey)) {
                    const cached = this.mappingCache.get(mappingKey);
                    primaryCategory = cached.primaryCategory;
                    subcategoryName = cached.subcategoryName;
                } else {
                    // 使用预编译规则
                    primaryCategory = this.applyCompiledRules(transactionDesc, amountType);
                    this.mappingCache.set(mappingKey, { primaryCategory, subcategoryName });
                }
                
                if (primaryCategory === '__ignore__') {
                    ignoredRows++;
                    return;
                }
                
                if (primaryCategory && primaryCategories.hasOwnProperty(primaryCategory)) {
                    const subcategoryKey = `${primaryCategory}|${subcategoryName}`;
                    if (!primaryCategories[primaryCategory].subcategories[subcategoryKey]) {
                        primaryCategories[primaryCategory].subcategories[subcategoryKey] = {
                            name: subcategoryName,
                            amount: 0,
                            count: 0,
                            amountType: amountType
                        };
                    }
                    
                    primaryCategories[primaryCategory].subcategories[subcategoryKey].amount += amount;
                    primaryCategories[primaryCategory].subcategories[subcategoryKey].count++;
                    primaryCategories[primaryCategory].amount += amount;
                }
            });
        }
        
        // 添加手动输入数据
        this.applyManualInputs(primaryCategories, manualInputs);
        
        // 计算汇总数据
        const summary = this.calculateSummary(primaryCategories);
        
        // 整理二级分类数据
        this.sortSubcategories(primaryCategories);
        
        console.timeEnd('generateFinalSummaryTable');
        
        return {
            primaryCategories,
            ...summary,
            rowCount: data.length,
            processedRows,
            ignoredRows,
            additionalProductCost: parseFloat(manualInputs.additionalProductCost) || 0,
            additionalAdvertisingFee: parseFloat(manualInputs.additionalAdvertisingFee) || 0
        };
    }
    
    // 辅助方法
    findTransactionKeyValue(row) {
        const possibleKeys = [
            'Transaction Key',
            'Transaction_Key',
            'transaction key',
            'transaction_key',
            '交易密钥',
            '交易key'
        ];
        
        for (const key of possibleKeys) {
            if (row.hasOwnProperty(key) && row[key] !== undefined) {
                return row[key];
            }
        }
        
        for (const [colName, value] of Object.entries(row)) {
            const normalizedColName = colName.toLowerCase().replace(/\s+/g, '');
            if (normalizedColName.includes('transaction') && 
                normalizedColName.includes('key')) {
                return value;
            }
        }
        
        return null;
    }
    
    isTransactionKeyEmpty(transactionKey) {
        if (transactionKey === null || transactionKey === undefined) {
            return true;
        }
        
        const keyStr = String(transactionKey).trim();
        return keyStr === '' || 
               keyStr === '#N/A' || 
               keyStr === 'N/A' || 
               keyStr === 'null' || 
               keyStr === 'undefined' ||
               /^\s*$/.test(keyStr);
    }
    
    findTransactionTimestamp(row) {
        const possibleKeys = [
            'Transaction Posted Timestamp',
            'Transaction_Posted_Timestamp',
            'transaction posted timestamp',
            '交易时间戳',
            'Posted Timestamp',
            'posted_timestamp',
            'Timestamp',
            'timestamp',
            'Transaction Time',
            'Transaction_Time',
            '交易时间'
        ];
        
        for (const key of possibleKeys) {
            if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
                return row[key];
            }
        }
        
        for (const [colName, value] of Object.entries(row)) {
            if ((colName.toLowerCase().includes('timestamp') || 
                 colName.toLowerCase().includes('时间')) &&
                value !== null && value !== undefined && value !== '') {
                return value;
            }
        }
        
        return null;
    }
    
    extractPurchaseOrder(row) {
        const possibleKeys = [
            'Purchase Order #',
            'Purchase Order',
            'PurchaseOrder',
            '采购订单号'
        ];
        
        for (const key of possibleKeys) {
            if (row[key]) {
                return row[key];
            }
        }
        
        for (const [key, value] of Object.entries(row)) {
            if (key.toLowerCase().includes('purchase') || 
                key.toLowerCase().includes('order') || 
                key.toLowerCase().includes('采购订单')) {
                return value;
            }
        }
        
        return null;
    }
    
    forceDateFormat(dateValue) {
        if (!dateValue || dateValue === '' || dateValue === '#N/A') {
            return '';
        }
        
        try {
            let date;
            
            if (dateValue instanceof Date) {
                date = dateValue;
            } else if (typeof dateValue === 'string') {
                const dateStr = dateValue.toString().trim();
                
                const simpleFormat = dateStr.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
                if (simpleFormat) {
                    const year = parseInt(simpleFormat[1]);
                    const month = parseInt(simpleFormat[2]);
                    const day = parseInt(simpleFormat[3]);
                    return `${year}/${month}/${day}`;
                }
                
                const withTimeFormat = dateStr.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
                if (withTimeFormat) {
                    const year = parseInt(withTimeFormat[1]);
                    const month = parseInt(withTimeFormat[2]);
                    const day = parseInt(withTimeFormat[3]);
                    return `${year}/${month}/${day}`;
                }
                
                const chineseFormat = dateStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
                if (chineseFormat) {
                    const year = parseInt(chineseFormat[1]);
                    const month = parseInt(chineseFormat[2]);
                    const day = parseInt(chineseFormat[3]);
                    return `${year}/${month}/${day}`;
                }
                
                date = new Date(dateStr);
            } else if (typeof dateValue === 'number') {
                date = new Date((dateValue - 25569) * 86400 * 1000);
            }
            
            if (date && !isNaN(date.getTime())) {
                const year = date.getFullYear();
                const month = date.getMonth() + 1;
                const day = date.getDate();
                return `${year}/${month}/${day}`;
            }
            
            return dateValue;
        } catch (e) {
            console.warn('日期强制格式化失败:', dateValue, e);
            return dateValue;
        }
    }
    
    formatDateForDisplay(dateValue) {
        const formatted = this.forceDateFormat(dateValue);
        return formatted || '#N/A';
    }
    
    sortTablesByDate(tables) {
        return tables.sort((a, b) => {
            const dateA = this.extractDateFromName(a.name);
            const dateB = this.extractDateFromName(b.name);
            
            if (dateA && dateB) {
                return dateA.startDate - dateB.startDate;
            }
            
            return a.name.localeCompare(b.name);
        });
    }
    
    extractDateFromName(name) {
        const dateMatch = name.match(/(\d{1,2})\.(\d{1,2})-(\d{1,2})\.(\d{1,2})/);
        if (dateMatch) {
            const month1 = parseInt(dateMatch[1]);
            const day1 = parseInt(dateMatch[2]);
            const currentYear = new Date().getFullYear();
            const startDate = new Date(currentYear, month1 - 1, day1);
            
            return {
                startDate: startDate,
                dateRange: `${month1}.${day1}-${dateMatch[3]}.${dateMatch[4]}`
            };
        }
        return null;
    }
    
    generateMergedTableName(tables) {
        if (tables.length === 0) return '账单汇总-新生成';
        
        const dateRanges = [];
        
        tables.forEach(table => {
            const dateInfo = this.extractDateFromName(table.name);
            if (dateInfo) {
                dateRanges.push(dateInfo.dateRange);
            }
        });
        
        if (dateRanges.length > 0) {
            const allDates = [];
            
            dateRanges.forEach(range => {
                const parts = range.split('-');
                if (parts.length === 2) {
                    allDates.push(parts[0]);
                    const endParts = parts[1].split('.');
                    if (endParts.length === 2) {
                        allDates.push(`${endParts[0]}.${endParts[1]}`);
                    }
                }
            });
            
            const uniqueDates = [...new Set(allDates)];
            
            if (uniqueDates.length >= 2) {
                const sortedDates = uniqueDates.sort((a, b) => {
                    const [aMonth, aDay] = a.split('.').map(Number);
                    const [bMonth, bDay] = b.split('.').map(Number);
                    return (aMonth - bMonth) || (aDay - bDay);
                });
                
                const startDate = sortedDates[0];
                const endDate = sortedDates[sortedDates.length - 1];
                
                return `${startDate}-${endDate}账单汇总-新生成`;
            }
        }
        
        const firstTable = tables[0];
        const lastTable = tables[tables.length - 1];
        
        return `${firstTable.name.replace('账单', '')}-${lastTable.name.replace('账单', '')}账单汇总-新生成`;
    }
    
    generateFinalTableName(originalName) {
        let baseName = originalName
            .replace('账单汇总-新生成', '')
            .replace('账单汇总', '')
            .replace('账单', '')
            .trim();
        
        if (!baseName.endsWith('账单')) {
            baseName += '账单';
        }
        
        return `${baseName}订单匹配-新生成`;
    }
    
    findDateColumn(row) {
        const possibleDateColumns = [
            '下单时间',
            'Transaction Posted Timestamp',
            'Posted Timestamp',
            'Timestamp',
            '交易时间',
            '日期',
            'Date',
            '下单日期',
            '时间'
        ];
        
        for (const col of possibleDateColumns) {
            if (row[col] !== undefined) {
                return col;
            }
        }
        
        for (const [colName, value] of Object.entries(row)) {
            const lowerColName = colName.toLowerCase();
            if ((lowerColName.includes('date') || 
                 lowerColName.includes('时间') || 
                 lowerColName.includes('timestamp')) &&
                value) {
                return colName;
            }
        }
        
        return null;
    }
    
    parseDate(dateValue) {
        if (!dateValue) return null;
        
        try {
            if (dateValue instanceof Date) {
                return dateValue;
            }
            
            if (typeof dateValue === 'string') {
                const formats = [
                    /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/,
                    /(\d{4})年(\d{1,2})月(\d{1,2})日/,
                    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
                ];
                
                for (const format of formats) {
                    const match = dateValue.match(format);
                    if (match) {
                        let year, month, day;
                        
                        if (match[1] && match[1].length === 4) {
                            year = parseInt(match[1]);
                            month = parseInt(match[2]) - 1;
                            day = parseInt(match[3]);
                        } else {
                            month = parseInt(match[1]) - 1;
                            day = parseInt(match[2]);
                            year = parseInt(match[3]);
                        }
                        
                        return new Date(year, month, day);
                    }
                }
                
                const date = new Date(dateValue);
                if (!isNaN(date.getTime())) {
                    return date;
                }
            }
            
            if (typeof dateValue === 'number') {
                return new Date((dateValue - 25569) * 86400 * 1000);
            }
            
        } catch (e) {
            console.warn('解析日期失败:', dateValue, e);
        }
        
        return null;
    }
    
    generateFilteredTableName(year, month, day) {
        let tableName = '筛选-';
        if (year) tableName += year;
        if (month) tableName += `-${month.padStart(2, '0')}`;
        if (day) tableName += `-${day.padStart(2, '0')}`;
        tableName += ' 账单数据';
        
        return tableName;
    }
    
    compileMappingRules() {
        // 预编译映射规则为正则表达式
        return [
            { pattern: /sale|销售|订单|revenue/i, category: '销售额' },
            { pattern: /ad|广告|sponsored|promotion/i, category: '广告费' },
            { pattern: /commission|fee|佣金|平台费|service/i, category: '平台佣金' },
            { pattern: /storage|warehouse|仓储|库存/i, category: '仓储费用' },
            { pattern: /product|cost|产品|采购|inventory/i, category: '产品成本' },
            { pattern: /return|refund|退货|退款/i, category: '退货费用' },
            { pattern: /review|test|测评|评价|vine/i, category: '测评费用' },
            { pattern: /shipping|logistics|物流|运费|delivery/i, category: '物流费' }
        ];
    }
    
    initializePrimaryCategories() {
        return {
            '销售额': { amount: 0, subcategories: {} },
            '广告费': { amount: 0, subcategories: {} },
            '平台佣金': { amount: 0, subcategories: {} },
            '仓储费用': { amount: 0, subcategories: {} },
            '产品成本': { amount: 0, subcategories: {} },
            '退货费用': { amount: 0, subcategories: {} },
            '测评费用': { amount: 0, subcategories: {} },
            '物流费': { amount: 0, subcategories: {} }
        };
    }
    
    applyCompiledRules(transactionDesc, amountType) {
        const descLower = transactionDesc.toLowerCase();
        
        for (const rule of this.compiledRules) {
            if (rule.pattern.test(descLower)) {
                return rule.category;
            }
        }
        
        return '';
    }
    
    applyManualInputs(primaryCategories, manualInputs) {
        // 物流费
        if (manualInputs.headLogisticsFee) {
            const headLogistics = parseFloat(manualInputs.headLogisticsFee) || 0;
            if (headLogistics > 0) {
                const subcategoryKey = '物流费|头程物流费';
                if (!primaryCategories['物流费'].subcategories[subcategoryKey]) {
                    primaryCategories['物流费'].subcategories[subcategoryKey] = {
                        name: '头程物流费',
                        amount: 0,
                        count: 1,
                        amountType: '手动输入'
                    };
                }
                primaryCategories['物流费'].subcategories[subcategoryKey].amount += headLogistics;
                primaryCategories['物流费'].amount += headLogistics;
            }
        }
        
        // 广告费
        if (manualInputs.additionalAdvertisingFee) {
            const additionalAdvertising = parseFloat(manualInputs.additionalAdvertisingFee) || 0;
            if (additionalAdvertising > 0) {
                const subcategoryKey = '广告费|额外广告费';
                if (!primaryCategories['广告费'].subcategories[subcategoryKey]) {
                    primaryCategories['广告费'].subcategories[subcategoryKey] = {
                        name: '额外广告费',
                        amount: 0,
                        count: 1,
                        amountType: '手动输入'
                    };
                }
                primaryCategories['广告费'].subcategories[subcategoryKey].amount += additionalAdvertising;
                primaryCategories['广告费'].amount += additionalAdvertising;
            }
        }
        
        // 产品成本（单独处理）
        if (manualInputs.additionalProductCost) {
            const additionalProduct = parseFloat(manualInputs.additionalProductCost) || 0;
            if (additionalProduct > 0) {
                const subcategoryKey = '产品成本|额外产品成本';
                if (!primaryCategories['产品成本'].subcategories[subcategoryKey]) {
                    primaryCategories['产品成本'].subcategories[subcategoryKey] = {
                        name: '额外产品成本',
                        amount: 0,
                        count: 1,
                        amountType: '手动输入'
                    };
                }
                primaryCategories['产品成本'].subcategories[subcategoryKey].amount += additionalProduct;
            }
        }
    }
    
    calculateSummary(primaryCategories) {
        const totalSales = primaryCategories['销售额'].amount;
        const totalCost = primaryCategories['广告费'].amount + 
                         primaryCategories['平台佣金'].amount + 
                         primaryCategories['仓储费用'].amount + 
                         primaryCategories['产品成本'].amount + 
                         primaryCategories['退货费用'].amount + 
                         primaryCategories['测评费用'].amount + 
                         primaryCategories['物流费'].amount;
        
        const profit = totalSales - totalCost;
        const profitMargin = totalSales > 0 ? (profit / totalSales) * 100 : 0;
        
        return {
            totalSales,
            totalCost,
            profit,
            profitMargin
        };
    }
    
    sortSubcategories(primaryCategories) {
        Object.keys(primaryCategories).forEach(category => {
            const subcategories = primaryCategories[category].subcategories;
            const sortedSubcategories = Object.values(subcategories).sort((a, b) => b.amount - a.amount);
            primaryCategories[category].subcategories = {};
            sortedSubcategories.forEach(sub => {
                const key = `${category}|${sub.name}`;
                primaryCategories[category].subcategories[key] = sub;
            });
        });
    }
    
    async yieldToMainThread() {
        return new Promise(resolve => {
            setTimeout(resolve, 0);
        });
    }
    
    // 性能监控
    recordProcessingTime(startTime, rowsProcessed) {
        const timeTaken = Date.now() - startTime;
        const rowsPerSecond = Math.round(rowsProcessed / (timeTaken / 1000));
        
        this.performanceMetrics.totalProcessed += rowsProcessed;
        this.performanceMetrics.averageLookupTime = 
            (this.performanceMetrics.averageLookupTime + timeTaken) / 2;
        
        return {
            timeTaken,
            rowsPerSecond,
            totalProcessed: this.performanceMetrics.totalProcessed
        };
    }
}