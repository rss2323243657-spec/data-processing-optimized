// 流式文件处理器
class OptimizedFileProcessor {
    constructor() {
        this.zipProcessor = new RobustZipProcessor();
        this.excelWorker = null;
        this.activeWorkers = new Set();
        console.log('优化文件处理器初始化');
    }
    
    async processFile(file, options = {}) {
        const fileExt = file.name.toLowerCase().split('.').pop();
        console.log('处理文件:', file.name, '大小:', (file.size / 1024 / 1024).toFixed(2), 'MB');
        
        try {
            if (fileExt === 'zip') {
                return await this.zipProcessor.processZipFile(file);
            } else if (fileExt === 'xlsx' || fileExt === 'xls') {
                return await this.processExcelFileWithWorker(file, options);
            } else if (fileExt === 'csv') {
                return await this.processCSVFile(file, options);
            } else {
                throw new Error('不支持的文件格式: ' + fileExt);
            }
        } catch (error) {
            console.error('处理文件失败:', error);
            throw error;
        }
    }
    
    async processExcelFileWithWorker(file, options = {}) {
        return new Promise((resolve, reject) => {
            // 创建Web Worker
            const worker = new Worker('./js/workers/excel-worker.js');
            this.activeWorkers.add(worker);
            
            const chunkSize = options.chunkSize || 1000;
            let allData = [];
            let processedChunks = 0;
            let totalChunks = 0;
            let startTime = Date.now();
            
            worker.onmessage = (e) => {
                switch (e.data.type) {
                    case 'chunk':
                        const chunkData = e.data.data;
                        processedChunks++;
                        
                        // 流式处理：立即处理并释放内存
                        allData = this.mergeDataStream(allData, chunkData);
                        
                        // 更新进度
                        if (options.onProgress) {
                            const progress = Math.round((processedChunks / totalChunks) * 100);
                            options.onProgress({
                                progress,
                                chunk: processedChunks,
                                totalChunks,
                                rowsProcessed: allData.length
                            });
                        }
                        break;
                        
                    case 'complete':
                        // 处理完成
                        worker.terminate();
                        this.activeWorkers.delete(worker);
                        
                        const processingTime = Date.now() - startTime;
                        console.log(`流式处理完成: ${allData.length}行, 耗时: ${processingTime}ms`);
                        
                        resolve({
                            name: file.name,
                            data: allData,
                            columns: allData.length > 0 ? Object.keys(allData[0]) : [],
                            rowCount: allData.length,
                            processingTime,
                            chunks: processedChunks
                        });
                        break;
                        
                    case 'error':
                        worker.terminate();
                        this.activeWorkers.delete(worker);
                        reject(new Error('Worker处理错误: ' + e.data.error));
                        break;
                }
            };
            
            worker.onerror = (error) => {
                worker.terminate();
                this.activeWorkers.delete(worker);
                reject(new Error('Worker错误: ' + error.message));
            };
            
            // 发送文件给Worker
            worker.postMessage({
                file: file,
                chunkSize: chunkSize,
                useStreaming: options.useStreaming !== false
            });
            
            // 估计总块数
            totalChunks = Math.ceil(file.size / (chunkSize * 100)); // 粗略估计
        });
    }
    
    mergeDataStream(existingData, newChunk) {
        // 流式合并数据
        if (!existingData || existingData.length === 0) {
            return newChunk;
        }
        
        // 简单合并
        return [...existingData, ...newChunk];
    }
    
    async processCSVFile(file, options = {}) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            const chunkSize = options.chunkSize || 5000;
            let allLines = [];
            
            reader.onload = (e) => {
                try {
                    const text = e.target.result;
                    const lines = text.split(/\r\n|\n|\r/);
                    
                    // 流式处理：分批处理
                    for (let i = 0; i < lines.length; i += chunkSize) {
                        const chunkLines = lines.slice(i, i + chunkSize);
                        const chunkData = this.parseCSVChunk(chunkLines, i === 0);
                        allLines = [...allLines, ...chunkData];
                        
                        // 更新进度
                        if (options.onProgress) {
                            const progress = Math.round((i + chunkLines.length) / lines.length * 100);
                            options.onProgress({
                                progress,
                                rowsProcessed: allLines.length
                            });
                        }
                    }
                    
                    resolve({
                        name: file.name,
                        data: allLines,
                        columns: allLines.length > 0 ? Object.keys(allLines[0]) : [],
                        rowCount: allLines.length
                    });
                } catch (error) {
                    reject(new Error('CSV文件解析失败: ' + error.message));
                }
            };
            
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsText(file, 'UTF-8');
        });
    }
    
    parseCSVChunk(lines, isFirstChunk) {
        if (lines.length === 0) return [];
        
        let headers = [];
        let data = [];
        
        // 检测分隔符
        const firstLine = lines[0];
        let delimiter = ',';
        const delimiterTests = [
            { char: ',', count: (firstLine.match(/,/g) || []).length },
            { char: '\t', count: (firstLine.match(/\t/g) || []).length },
            { char: ';', count: (firstLine.match(/;/g) || []).length },
            { char: '|', count: (firstLine.match(/\|/g) || []).length }
        ];
        
        delimiterTests.sort((a, b) => b.count - a.count);
        if (delimiterTests[0].count > 0) {
            delimiter = delimiterTests[0].char;
        }
        
        // 解析函数
        const parseCSVLine = (line) => {
            const result = [];
            let current = '';
            let inQuotes = false;
            let quoteChar = '';
            
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                const nextChar = line[i + 1];
                
                if ((char === '"' || char === "'") && !inQuotes) {
                    inQuotes = true;
                    quoteChar = char;
                } else if (char === quoteChar && inQuotes) {
                    if (nextChar === quoteChar) {
                        current += char;
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else if (char === delimiter && !inQuotes) {
                    result.push(current);
                    current = '';
                } else {
                    current += char;
                }
            }
            
            result.push(current);
            return result.map(v => v.trim());
        };
        
        // 如果是第一块，获取表头
        if (isFirstChunk && lines.length > 0) {
            headers = parseCSVLine(lines[0]).map(h => h.replace(/^["']|["']$/g, ''));
            lines = lines.slice(1); // 移除表头行
        }
        
        // 解析数据行
        lines.forEach(line => {
            if (line.trim() === '') return;
            
            const values = parseCSVLine(line);
            const row = {};
            
            headers.forEach((header, index) => {
                let value = values[index] || '';
                value = value.replace(/^["']|["']$/g, '');
                
                // 尝试转换为数字
                if (value !== '' && !isNaN(value) && value.trim() !== '') {
                    const num = Number(value);
                    if (!isNaN(num) && isFinite(num)) {
                        value = num % 1 === 0 ? parseInt(value) : num;
                    }
                }
                
                row[header || `列${index + 1}`] = value;
            });
            
            // 检查行是否有有效数据
            if (Object.values(row).some(val => {
                if (typeof val === 'number') return true;
                if (typeof val === 'string') return val.trim() !== '';
                return val !== null && val !== undefined;
            })) {
                data.push(row);
            }
        });
        
        return data;
    }
    
    // 终止所有Worker
    terminateAllWorkers() {
        this.activeWorkers.forEach(worker => {
            worker.terminate();
        });
        this.activeWorkers.clear();
    }
}

// 强大的ZIP文件处理器
class RobustZipProcessor {
    constructor() {
        console.log('强大的ZIP文件处理器初始化');
    }
    
    async processZipFile(file) {
        console.log('开始处理ZIP文件:', file.name);
        
        try {
            if (typeof JSZip === 'undefined') {
                throw new Error('JSZip库未加载，请刷新页面重试');
            }
            
            const zip = await JSZip.loadAsync(file);
            const processedFiles = [];
            const fileList = [];
            
            // 收集所有文件
            for (const [filename, zipEntry] of Object.entries(zip.files)) {
                if (zipEntry.dir) continue;
                fileList.push({ filename, zipEntry });
            }
            
            console.log('ZIP中包含文件数量:', fileList.length);
            
            if (fileList.length === 0) {
                throw new Error('ZIP文件中没有找到任何文件');
            }
            
            // 流式处理每个文件
            for (const { filename, zipEntry } of fileList) {
                try {
                    const fileData = await this.processZipEntry(zipEntry, filename, file.name);
                    
                    if (fileData && fileData.rowCount > 0) {
                        processedFiles.push(fileData);
                    }
                } catch (error) {
                    console.error(`处理ZIP中的文件失败 ${filename}:`, error);
                }
            }
            
            if (processedFiles.length === 0) {
                throw new Error('ZIP文件中没有找到有效的数据文件');
            }
            
            return {
                name: file.name,
                isZip: true,
                files: processedFiles,
                fileCount: processedFiles.length
            };
            
        } catch (error) {
            console.error('处理ZIP文件失败:', error);
            throw new Error('ZIP文件处理失败: ' + error.message);
        }
    }
    
    async processZipEntry(zipEntry, filename, zipFileName) {
        try {
            const ext = filename.toLowerCase().split('.').pop();
            
            if (ext === 'xlsx' || ext === 'xls') {
                const arrayBuffer = await zipEntry.async('arraybuffer');
                return await this.processExcelData(arrayBuffer, filename, zipFileName);
            } else if (ext === 'csv' || ext === 'txt') {
                const text = await this.readZipEntryWithEncoding(zipEntry);
                return await this.processCSVData(text, filename, zipFileName);
            }
            
            return null;
        } catch (error) {
            console.error(`处理ZIP条目失败 ${filename}:`, error);
            return null;
        }
    }
    
    async readZipEntryWithEncoding(zipEntry) {
        const encodings = ['utf-8', 'gbk', 'gb2312', 'big5', 'latin1'];
        
        for (const encoding of encodings) {
            try {
                const uint8Array = await zipEntry.async('uint8array');
                const decoder = new TextDecoder(encoding);
                return decoder.decode(uint8Array);
            } catch (e) {
                continue;
            }
        }
        
        return await zipEntry.async('string');
    }
    
    async processExcelData(arrayBuffer, filename, zipFileName) {
        try {
            const data = new Uint8Array(arrayBuffer);
            const workbook = XLSX.read(data, { 
                type: 'array',
                cellDates: true,
                cellNF: false,
                cellText: true
            });
            
            const allData = [];
            
            workbook.SheetNames.forEach(sheetName => {
                try {
                    const worksheet = workbook.Sheets[sheetName];
                    let jsonData = XLSX.utils.sheet_to_json(worksheet, {
                        defval: '',
                        raw: false,
                        dateNF: 'yyyy/mm/dd',
                        blankrows: true
                    });
                    
                    // 跳过前3行
                    if (jsonData.length > 3) {
                        jsonData = jsonData.filter((row, index) => index >= 3);
                    }
                    
                    // 清理数据
                    jsonData = jsonData.filter(row => {
                        const values = Object.values(row);
                        return values.some(val => 
                            val !== null && val !== undefined && val !== '' && 
                            !(typeof val === 'string' && val.trim() === '')
                        );
                    });
                    
                    if (jsonData.length > 0) {
                        allData.push(...jsonData);
                    }
                } catch (sheetError) {
                    console.error(`处理工作表 ${sheetName} 失败:`, sheetError);
                }
            });
            
            if (allData.length === 0) {
                return null;
            }
            
            // 智能命名
            const baseName = this.extractBaseName(zipFileName);
            const displayName = `${baseName}账单`;
            
            return {
                name: displayName,
                data: allData,
                columns: allData.length > 0 ? Object.keys(allData[0]) : [],
                rowCount: allData.length,
                fromZip: true,
                originalFileName: filename,
                zipFileName: zipFileName,
                fileType: 'excel'
            };
        } catch (error) {
            console.error('处理Excel数据失败:', error);
            throw error;
        }
    }
    
    async processCSVData(text, filename, zipFileName) {
        try {
            const lines = text.split(/\r\n|\n|\r/).filter(line => line.trim() !== '');
            
            if (lines.length < 2) {
                return null;
            }
            
            // 检测分隔符
            const firstLine = lines[0];
            let delimiter = ',';
            const delimiterTests = [
                { char: ',', count: (firstLine.match(/,/g) || []).length },
                { char: '\t', count: (firstLine.match(/\t/g) || []).length },
                { char: ';', count: (firstLine.match(/;/g) || []).length }
            ];
            
            delimiterTests.sort((a, b) => b.count - a.count);
            if (delimiterTests[0].count > 0) {
                delimiter = delimiterTests[0].char;
            }
            
            // 解析函数
            const parseCSVLine = (line) => {
                const result = [];
                let current = '';
                let inQuotes = false;
                let quoteChar = '';
                
                for (let i = 0; i < line.length; i++) {
                    const char = line[i];
                    const nextChar = line[i + 1];
                    
                    if ((char === '"' || char === "'") && !inQuotes) {
                        inQuotes = true;
                        quoteChar = char;
                    } else if (char === quoteChar && inQuotes) {
                        if (nextChar === quoteChar) {
                            current += char;
                            i++;
                        } else {
                            inQuotes = false;
                        }
                    } else if (char === delimiter && !inQuotes) {
                        result.push(current);
                        current = '';
                    } else {
                        current += char;
                    }
                }
                
                result.push(current);
                return result.map(v => v.trim());
            };
            
            const headers = parseCSVLine(lines[0]).map(h => h.replace(/^["']|["']$/g, ''));
            const data = [];
            const startLine = Math.min(3, lines.length - 1);
            
            for (let i = startLine; i < lines.length; i++) {
                const values = parseCSVLine(lines[i]);
                const row = {};
                
                headers.forEach((header, index) => {
                    let value = values[index] || '';
                    value = value.replace(/^["']|["']$/g, '');
                    
                    if (value !== '' && !isNaN(value) && value.trim() !== '') {
                        const num = Number(value);
                        if (!isNaN(num) && isFinite(num)) {
                            value = num % 1 === 0 ? parseInt(value) : num;
                        }
                    }
                    
                    row[header || `列${index + 1}`] = value;
                });
                
                if (Object.values(row).some(val => {
                    if (typeof val === 'number') return true;
                    if (typeof val === 'string') return val.trim() !== '';
                    return val !== null && val !== undefined;
                })) {
                    data.push(row);
                }
            }
            
            if (data.length === 0) {
                return null;
            }
            
            const baseName = this.extractBaseName(zipFileName);
            const displayName = `${baseName}账单`;
            
            return {
                name: displayName,
                data: data,
                columns: headers,
                rowCount: data.length,
                fromZip: true,
                originalFileName: filename,
                zipFileName: zipFileName,
                fileType: 'csv'
            };
        } catch (error) {
            console.error('处理CSV数据失败:', error);
            throw error;
        }
    }
    
    extractBaseName(fileName) {
        let baseName = fileName.replace(/^.*[\\\/]/, '');
        baseName = baseName.replace(/\.[^/.]+$/, '');
        baseName = baseName.replace(/[<>:"/\\|?*]/g, '');
        return baseName.trim();
    }
}