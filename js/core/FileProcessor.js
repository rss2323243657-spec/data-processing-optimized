class FileProcessor {
    constructor() {
        this.chunkSize = 1000;
        this.maxFileSize = 100 * 1024 * 1024; // 100MB
        this.supportedFormats = ['.csv', '.xlsx', '.xls', '.zip'];
    }

    // 处理上传的文件
    async processFiles(files, options = {}) {
        const results = [];
        
        for (let file of files) {
            try {
                const result = await this.processSingleFile(file, options);
                results.push(result);
            } catch (error) {
                console.error(`处理文件 ${file.name} 失败:`, error);
                results.push({
                    success: false,
                    fileName: file.name,
                    error: error.message
                });
            }
        }
        
        return results;
    }

    // 处理单个文件
    async processSingleFile(file, options = {}) {
        // 验证文件大小
        if (file.size > this.maxFileSize) {
            throw new Error(`文件大小超过限制 (${(file.size / 1024 / 1024).toFixed(1)}MB > 100MB)`);
        }

        // 验证文件格式
        const fileExt = this.getFileExtension(file.name).toLowerCase();
        if (!this.supportedFormats.includes(fileExt)) {
            throw new Error(`不支持的文件格式: ${fileExt}，支持: ${this.supportedFormats.join(', ')}`);
        }

        // 根据文件类型处理
        let result;
        if (fileExt === '.csv') {
            result = await this.processCSVFile(file, options);
        } else if (fileExt === '.zip') {
            result = await this.processZipFile(file, options);
        } else {
            result = await this.processExcelFile(file, options);
        }

        return {
            success: true,
            fileName: file.name,
            tables: result.tables,
            totalRows: result.totalRows,
            processedFiles: result.processedFiles || 1
        };
    }

    // 处理Excel文件
    async processExcelFile(file, options) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { 
                        type: 'array',
                        cellDates: true,
                        cellNF: false,
                        cellText: false
                    });
                    
                    const tables = [];
                    let totalRows = 0;
                    
                    // 处理每个工作表
                    workbook.SheetNames.forEach((sheetName, index) => {
                        const worksheet = workbook.Sheets[sheetName];
                        
                        // 转换为JSON
                        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
                            defval: '', // 空单元格的默认值
                            raw: false  // 使用格式化后的值
                        });
                        
                        if (jsonData.length > 0) {
                            // 获取列名
                            const columns = Object.keys(jsonData[0]);
                            
                            tables.push({
                                name: `${file.name.replace(/\.[^/.]+$/, "")} - ${sheetName}`,
                                data: jsonData,
                                columns: columns,
                                sheetName: sheetName,
                                rowCount: jsonData.length,
                                columnCount: columns.length
                            });
                            
                            totalRows += jsonData.length;
                        }
                    });
                    
                    if (tables.length === 0) {
                        reject(new Error('Excel文件中没有有效数据'));
                        return;
                    }
                    
                    resolve({ tables, totalRows });
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    // 处理CSV文件
    async processCSVFile(file, options) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const csvText = e.target.result;
                    const lines = csvText.split('\n').filter(line => line.trim());
                    
                    if (lines.length < 2) {
                        reject(new Error('CSV文件内容为空或只有标题行'));
                        return;
                    }
                    
                    // 解析CSV
                    const headers = this.parseCSVLine(lines[0]);
                    const data = [];
                    
                    // 从第二行开始解析数据
                    for (let i = 1; i < lines.length; i++) {
                        if (lines[i].trim()) {
                            const values = this.parseCSVLine(lines[i]);
                            const row = {};
                            
                            // 确保列数和标题一致
                            headers.forEach((header, index) => {
                                row[header] = values[index] !== undefined ? values[index].trim() : '';
                            });
                            
                            data.push(row);
                        }
                    }
                    
                    const tables = [{
                        name: file.name.replace(/\.[^/.]+$/, ""),
                        data: data,
                        columns: headers,
                        rowCount: data.length,
                        columnCount: headers.length
                    }];
                    
                    resolve({ tables, totalRows: data.length });
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = reject;
            reader.readAsText(file, 'UTF-8');
        });
    }

    // 处理ZIP文件
    async processZipFile(file, options) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = async (e) => {
                try {
                    const arrayBuffer = e.target.result;
                    
                    // 检查JSZip库是否可用
                    if (typeof JSZip === 'undefined') {
                        throw new Error('JSZip库未加载，无法解压ZIP文件');
                    }
                    
                    // 使用JSZip库解压
                    const zip = new JSZip();
                    const zipContent = await zip.loadAsync(arrayBuffer);
                    
                    const tables = [];
                    let totalRows = 0;
                    let processedFiles = 0;
                    let failedFiles = 0;
                    
                    // 获取ZIP文件中的所有文件
                    const filePromises = [];
                    
                    zipContent.forEach((relativePath, zipEntry) => {
                        if (!zipEntry.dir) {
                            filePromises.push(this.processZipEntry(zipEntry, relativePath));
                        }
                    });
                    
                    if (filePromises.length === 0) {
                        reject(new Error('ZIP文件中没有找到任何文件'));
                        return;
                    }
                    
                    // 等待所有文件处理完成
                    const results = await Promise.allSettled(filePromises);
                    
                    // 收集所有结果
                    results.forEach(result => {
                        if (result.status === 'fulfilled' && result.value) {
                            tables.push(...result.value.tables);
                            totalRows += result.value.totalRows;
                            processedFiles++;
                        } else {
                            failedFiles++;
                            console.error('处理ZIP内文件失败:', result.reason);
                        }
                    });
                    
                    if (tables.length === 0) {
                        reject(new Error('ZIP文件中没有找到有效的数据文件'));
                        return;
                    }
                    
                    console.log(`ZIP处理完成: 成功 ${processedFiles} 个文件，失败 ${failedFiles} 个文件`);
                    
                    resolve({ 
                        tables, 
                        totalRows, 
                        processedFiles,
                        failedFiles 
                    });
                } catch (error) {
                    reject(new Error(`处理ZIP文件失败: ${error.message}`));
                }
            };
            
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    // 处理ZIP条目（单个文件）
    async processZipEntry(zipEntry, relativePath) {
        try {
            // 获取文件扩展名
            const fileExt = this.getFileExtension(zipEntry.name).toLowerCase();
            
            // 只处理支持的文件格式
            if (!['.csv', '.xlsx', '.xls'].includes(fileExt)) {
                console.log(`跳过不支持的文件格式: ${zipEntry.name} (${fileExt})`);
                return null;
            }
            
            console.log(`正在处理ZIP内文件: ${zipEntry.name}`);
            
            // 读取文件内容
            const fileContent = await zipEntry.async('arraybuffer');
            
            if (fileExt === '.csv') {
                // 处理CSV
                const csvText = new TextDecoder('utf-8').decode(fileContent);
                return await this.processCSVContent(csvText, zipEntry.name);
            } else {
                // 处理Excel
                return await this.processExcelContent(fileContent, zipEntry.name);
            }
        } catch (error) {
            console.error(`处理ZIP条目 ${zipEntry.name} 失败:`, error);
            throw error;
        }
    }

    // 处理Excel内容（从Buffer）
    async processExcelContent(arrayBuffer, fileName) {
        try {
            const workbook = XLSX.read(arrayBuffer, { 
                type: 'array',
                cellDates: true,
                cellNF: false,
                cellText: false
            });
            
            const tables = [];
            let totalRows = 0;
            
            workbook.SheetNames.forEach((sheetName, index) => {
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, {
                    defval: '',
                    raw: false
                });
                
                if (jsonData.length > 0) {
                    const columns = Object.keys(jsonData[0]);
                    
                    tables.push({
                        name: `${fileName.replace(/\.[^/.]+$/, "")} - ${sheetName}`,
                        data: jsonData,
                        columns: columns,
                        sheetName: sheetName,
                        rowCount: jsonData.length,
                        columnCount: columns.length,
                        sourceFile: fileName,
                        fromZip: true
                    });
                    
                    totalRows += jsonData.length;
                }
            });
            
            if (tables.length === 0) {
                throw new Error('Excel文件中没有有效数据');
            }
            
            return { tables, totalRows };
        } catch (error) {
            console.error(`处理Excel文件 ${fileName} 失败:`, error);
            throw error;
        }
    }

    // 处理CSV内容（从文本）
    async processCSVContent(csvText, fileName) {
        try {
            const lines = csvText.split('\n').filter(line => line.trim());
            
            if (lines.length < 2) {
                throw new Error('CSV文件内容为空或只有标题行');
            }
            
            const headers = this.parseCSVLine(lines[0]);
            const data = [];
            
            for (let i = 1; i < lines.length; i++) {
                if (lines[i].trim()) {
                    const values = this.parseCSVLine(lines[i]);
                    const row = {};
                    
                    headers.forEach((header, index) => {
                        row[header] = values[index] !== undefined ? values[index].trim() : '';
                    });
                    
                    data.push(row);
                }
            }
            
            const tables = [{
                name: fileName.replace(/\.[^/.]+$/, ""),
                data: data,
                columns: headers,
                rowCount: data.length,
                columnCount: headers.length,
                sourceFile: fileName,
                fromZip: true
            }];
            
            return { tables, totalRows: data.length };
        } catch (error) {
            console.error(`处理CSV文件 ${fileName} 失败:`, error);
            throw error;
        }
    }

    // 解析CSV行，处理引号和逗号
    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                // 检查是否是转义的引号
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++; // 跳过下一个引号
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current);
        return result.map(cell => cell.trim());
    }

    // 获取文件扩展名
    getFileExtension(filename) {
        const lastDot = filename.lastIndexOf('.');
        return lastDot === -1 ? '' : filename.slice(lastDot);
    }

    // 批量处理文件（分块）
    async processFilesInChunks(files, progressCallback) {
        const results = [];
        let processedFiles = 0;
        
        for (let file of files) {
            try {
                progressCallback?.({
                    type: 'file_start',
                    fileName: file.name,
                    current: processedFiles + 1,
                    total: files.length
                });
                
                const result = await this.processSingleFile(file);
                results.push(result);
                
                processedFiles++;
                progressCallback?.({
                    type: 'file_complete',
                    fileName: file.name,
                    current: processedFiles,
                    total: files.length
                });
            } catch (error) {
                console.error(`处理文件 ${file.name} 失败:`, error);
                results.push({
                    success: false,
                    fileName: file.name,
                    error: error.message
                });
            }
        }
        
        return results;
    }

    // 验证文件数据
    validateData(data, options = {}) {
        const issues = [];
        
        // 检查是否有数据
        if (!data || data.length === 0) {
            issues.push({ type: 'empty', message: '数据为空' });
            return { valid: false, issues };
        }
        
        // 检查列名
        const firstRow = data[0];
        const columns = Object.keys(firstRow);
        
        if (columns.length === 0) {
            issues.push({ type: 'no_columns', message: '没有检测到列名' });
        }
        
        // 检查空值
        if (options.checkEmptyValues) {
            const emptyValues = [];
            data.forEach((row, rowIndex) => {
                columns.forEach(col => {
                    if (row[col] === null || row[col] === undefined || row[col] === '') {
                        emptyValues.push({ row: rowIndex + 1, column: col });
                    }
                });
            });
            
            if (emptyValues.length > 0) {
                issues.push({
                    type: 'empty_values',
                    message: `发现 ${emptyValues.length} 个空值`,
                    details: emptyValues.slice(0, 10) // 只显示前10个
                });
            }
        }
        
        // 检查重复行
        if (options.checkDuplicates) {
            const uniqueRows = new Set();
            const duplicates = [];
            
            data.forEach((row, index) => {
                const rowString = JSON.stringify(row);
                if (uniqueRows.has(rowString)) {
                    duplicates.push(index + 1);
                } else {
                    uniqueRows.add(rowString);
                }
            });
            
            if (duplicates.length > 0) {
                issues.push({
                    type: 'duplicates',
                    message: `发现 ${duplicates.length} 行重复数据`,
                    details: duplicates.slice(0, 10)
                });
            }
        }
        
        return {
            valid: issues.length === 0,
            issues,
            stats: {
                totalRows: data.length,
                totalColumns: columns.length,
                columns: columns
            }
        };
    }
}

// 导出实例
const fileProcessor = new FileProcessor();
window.fileProcessor = fileProcessor;
