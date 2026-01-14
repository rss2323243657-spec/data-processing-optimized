class DataStorage {
    constructor() {
        this.tables = new Map();
        this.tableMetadata = new Map();
        this.currentTableId = 0;
        this.init();
    }

    init() {
        // 从localStorage恢复数据
        this.restoreFromStorage();
    }

    // 保存表格数据
    saveTable(name, data, columns = null, metadata = {}) {
        const tableId = `table_${Date.now()}_${this.currentTableId++}`;
        
        // 自动检测列名
        if (!columns && data.length > 0) {
            columns = Object.keys(data[0]);
        }
        
        const tableData = {
            id: tableId,
            name: name,
            data: data,
            columns: columns || [],
            metadata: {
                created: new Date().toISOString(),
                rowCount: data.length,
                columnCount: columns ? columns.length : 0,
                ...metadata
            }
        };
        
        this.tables.set(tableId, tableData);
        this.saveToStorage();
        
        return tableId;
    }

    // 获取表格
    getTable(tableId) {
        return this.tables.get(tableId);
    }

    // 获取所有表格
    getAllTables() {
        return Array.from(this.tables.values());
    }

    // 删除表格
    deleteTable(tableId) {
        const deleted = this.tables.delete(tableId);
        if (deleted) {
            this.saveToStorage();
        }
        return deleted;
    }

    // 清空所有表格
    clearAllTables() {
        this.tables.clear();
        this.saveToStorage();
    }

    // 更新表格数据
    updateTable(tableId, data, columns = null) {
        const table = this.tables.get(tableId);
        if (!table) return false;
        
        table.data = data;
        if (columns) {
            table.columns = columns;
        }
        
        table.metadata.rowCount = data.length;
        table.metadata.columnCount = table.columns.length;
        table.metadata.updated = new Date().toISOString();
        
        this.saveToStorage();
        return true;
    }

    // 添加表格元数据
    addTableMetadata(tableId, key, value) {
        const table = this.tables.get(tableId);
        if (table) {
            table.metadata[key] = value;
            this.saveToStorage();
            return true;
        }
        return false;
    }

    // 获取表格统计信息
    getTableStats() {
        const stats = {
            totalTables: this.tables.size,
            totalRows: 0,
            totalColumns: 0,
            tables: []
        };
        
        for (const table of this.tables.values()) {
            stats.totalRows += table.data.length;
            stats.totalColumns += table.columns.length;
            stats.tables.push({
                id: table.id,
                name: table.name,
                rows: table.data.length,
                columns: table.columns.length
            });
        }
        
        return stats;
    }

    // 导出表格为CSV
    exportToCSV(tableId) {
        const table = this.tables.get(tableId);
        if (!table) return '';
        
        const headers = table.columns.join(',');
        const rows = table.data.map(row => {
            return table.columns.map(col => {
                const value = row[col];
                // 处理CSV特殊字符
                if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return value || '';
            }).join(',');
        });
        
        return [headers, ...rows].join('\n');
    }

    // 导出表格为JSON
    exportToJSON(tableId) {
        const table = this.tables.get(tableId);
        if (!table) return '';
        
        return JSON.stringify({
            name: table.name,
            columns: table.columns,
            data: table.data,
            metadata: table.metadata
        }, null, 2);
    }

    // 保存到localStorage
    saveToStorage() {
        try {
            const storageData = {
                tables: Array.from(this.tables.entries()),
                currentTableId: this.currentTableId,
                version: '1.0.0',
                lastSaved: new Date().toISOString()
            };
            
            localStorage.setItem('dataCalcSystem', JSON.stringify(storageData));
            return true;
        } catch (error) {
            console.error('保存数据失败:', error);
            return false;
        }
    }

    // 从localStorage恢复
    restoreFromStorage() {
        try {
            const saved = localStorage.getItem('dataCalcSystem');
            if (saved) {
                const data = JSON.parse(saved);
                
                // 恢复tables
                this.tables = new Map(data.tables || []);
                this.currentTableId = data.currentTableId || 0;
                
                console.log(`从存储恢复 ${this.tables.size} 个表格`);
                return true;
            }
        } catch (error) {
            console.error('恢复数据失败:', error);
        }
        return false;
    }

    // 搜索表格
    searchTables(searchText) {
        const results = [];
        searchText = searchText.toLowerCase();
        
        for (const table of this.tables.values()) {
            if (table.name.toLowerCase().includes(searchText)) {
                results.push(table);
                continue;
            }
            
            // 搜索列名
            const columnMatch = table.columns.some(col => 
                col.toLowerCase().includes(searchText)
            );
            
            if (columnMatch) {
                results.push(table);
            }
        }
        
        return results;
    }

    // 复制表格
    duplicateTable(tableId, newName = null) {
        const original = this.tables.get(tableId);
        if (!original) return null;
        
        const newTable = {
            ...original,
            data: JSON.parse(JSON.stringify(original.data)), // 深拷贝
            metadata: {
                ...original.metadata,
                created: new Date().toISOString(),
                source: tableId,
                duplicated: true
            }
        };
        
        if (newName) {
            newTable.name = newName;
        } else {
            newTable.name = `${original.name} (副本)`;
        }
        
        return this.saveTable(newTable.name, newTable.data, newTable.columns, newTable.metadata);
    }

    // 合并多个表格
    mergeTables(tableIds, mergedName = '合并表格') {
        const tables = tableIds.map(id => this.tables.get(id)).filter(Boolean);
        if (tables.length === 0) return null;
        
        // 检查所有表格是否有相同的列结构
        const firstTable = tables[0];
        const allSameColumns = tables.every(table => 
            JSON.stringify(table.columns.sort()) === JSON.stringify(firstTable.columns.sort())
        );
        
        if (!allSameColumns) {
            console.warn('表格列结构不一致，使用所有列名合并');
            // 收集所有列名
            const allColumns = new Set();
            tables.forEach(table => table.columns.forEach(col => allColumns.add(col)));
            firstTable.columns = Array.from(allColumns);
        }
        
        // 合并数据
        let mergedData = [];
        tables.forEach(table => {
            mergedData = mergedData.concat(table.data);
        });
        
        return this.saveTable(mergedName, mergedData, firstTable.columns, {
            mergedFrom: tableIds,
            rowCount: mergedData.length,
            sourceTables: tables.map(t => t.name)
        });
    }
}

// 导出单例实例
const dataStorage = new DataStorage();
window.dataStorage = dataStorage;
