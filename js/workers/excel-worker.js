// Excel流式解析Web Worker
self.importScripts('https://unpkg.com/xlsx/dist/xlsx.full.min.js');

self.onmessage = async function(e) {
    const { file, chunkSize = 1000, useStreaming = true } = e.data;
    
    try {
        if (!useStreaming) {
            // 传统方式：一次性读取
            const result = await processFileTraditional(file);
            self.postMessage({ type: 'complete', data: result });
            return;
        }
        
        // 流式处理
        const reader = new FileReader();
        
        reader.onload = function(event) {
            try {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, {
                    type: 'array',
                    sheetStubs: true,
                    cellFormula: false,
                    cellHTML: false,
                    cellStyles: false,
                    bookVBA: false
                });
                
                let totalChunks = 0;
                let processedChunks = 0;
                
                // 处理每个工作表
                workbook.SheetNames.forEach((sheetName, sheetIndex) => {
                    const worksheet = workbook.Sheets[sheetName];
                    
                    // 获取工作表范围
                    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
                    const totalRows = range.e.r - range.s.r + 1;
                    
                    // 计算总块数
                    const sheetChunks = Math.ceil(totalRows / chunkSize);
                    totalChunks += sheetChunks;
                    
                    // 分块处理
                    for (let startRow = 0; startRow < totalRows; startRow += chunkSize) {
                        const endRow = Math.min(startRow + chunkSize, totalRows);
                        
                        // 创建部分范围
                        const partialRange = {
                            s: { r: startRow, c: range.s.c },
                            e: { r: endRow - 1, c: range.e.c }
                        };
                        
                        const partialRef = XLSX.utils.encode_range(partialRange);
                        
                        // 提取部分数据
                        const partialWs = XLSX.utils.sheet_to_json(worksheet, {
                            range: partialRef,
                            defval: '',
                            raw: false,
                            dateNF: 'yyyy/mm/dd',
                            blankrows: false
                        });
                        
                        // 清理数据
                        const cleanedData = cleanRows(partialWs);
                        
                        if (cleanedData.length > 0) {
                            processedChunks++;
                            
                            // 发送数据块
                            self.postMessage({
                                type: 'chunk',
                                data: cleanedData,
                                sheetName,
                                sheetIndex,
                                chunkIndex: Math.floor(startRow / chunkSize),
                                totalChunks: sheetChunks,
                                progress: Math.round((processedChunks / totalChunks) * 100)
                            });
                        }
                    }
                });
                
                // 处理完成
                self.postMessage({ type: 'complete' });
                
            } catch (error) {
                self.postMessage({ type: 'error', error: error.message });
            }
        };
        
        reader.onerror = function() {
            self.postMessage({ type: 'error', error: '文件读取失败' });
        };
        
        reader.readAsArrayBuffer(file);
        
    } catch (error) {
        self.postMessage({ type: 'error', error: error.message });
    }
};

// 传统处理方式
async function processFileTraditional(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = function(event) {
            try {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, {
                    type: 'array',
                    cellDates: true,
                    cellNF: false,
                    cellText: true
                });
                
                const allData = [];
                
                workbook.SheetNames.forEach(sheetName => {
                    const worksheet = workbook.Sheets[sheetName];
                    let jsonData = XLSX.utils.sheet_to_json(worksheet, {
                        defval: '',
                        raw: false,
                        dateNF: 'yyyy/mm/dd'
                    });
                    
                    // 跳过前3行
                    if (jsonData.length > 3) {
                        jsonData = jsonData.filter((row, index) => index >= 3);
                    }
                    
                    // 清理数据
                    jsonData = cleanRows(jsonData);
                    
                    if (jsonData.length > 0) {
                        allData.push(...jsonData);
                    }
                });
                
                resolve(allData);
                
            } catch (error) {
                reject(error);
            }
        };
        
        reader.onerror = function() {
            reject(new Error('文件读取失败'));
        };
        
        reader.readAsArrayBuffer(file);
    });
}

// 清理行数据
function cleanRows(rows) {
    return rows.filter(row => {
        // 检查行是否有有效数据
        const values = Object.values(row);
        return values.some(val => 
            val !== null && val !== undefined && val !== '' && 
            !(typeof val === 'string' && val.trim() === '')
        );
    }).map(row => {
        // 只保留必要字段
        const cleanRow = {};
        const keepFields = [
            'Transaction Description', 'Transaction_Description', 'transaction_description',
            'Amount Type', 'Amount_Type', 'amount_type', 'Type',
            'Amount', 'amount',
            'Transaction Type', 'Transaction_Type', 'transaction_type',
            'Transaction Posted Timestamp', 'Transaction_Posted_Timestamp', 'transaction_posted_timestamp',
            'Timestamp', 'timestamp',
            'Purchase Order #', 'Purchase Order', 'PurchaseOrder', '采购订单号',
            'Transaction Key', 'Transaction_Key', 'transaction_key'
        ];
        
        Object.keys(row).forEach(key => {
            // 检查是否是需要保留的字段
            const shouldKeep = keepFields.some(field => 
                key.toLowerCase().includes(field.toLowerCase()) ||
                field.toLowerCase().includes(key.toLowerCase())
            );
            
            if (shouldKeep) {
                let value = row[key];
                
                // 处理数字类型
                if (typeof value === 'string' && !isNaN(value) && value.trim() !== '') {
                    const num = Number(value);
                    if (!isNaN(num) && isFinite(num)) {
                        value = num % 1 === 0 ? parseInt(value) : num;
                    }
                }
                
                cleanRow[key] = value;
            }
        });
        
        return cleanRow;
    });
}