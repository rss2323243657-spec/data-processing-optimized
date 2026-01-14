// 优化的UI管理器
class OptimizedUIManager {
    constructor() {
        this.storage = new OptimizedDataStorage();
        this.fileProcessor = new OptimizedFileProcessor();
        this.dataProcessor = new OptimizedDataProcessor(this.storage);
        
        // 字段映射分页相关
        this.fieldMappingPageSize = 100;
        this.fieldMappingCurrentPage = 1;
        this.fieldMappingTotalPages = 1;
        this.filteredFieldCombinations = [];
        this.allFieldCombinations = [];
        
        // 虚拟滚动实例
        this.virtualScroll = null;
        this.blankRowVirtualScroll = null;
        
        // 性能监控
        this.performance = {
            startTime: null,
            processedRows: 0,
            lastUpdate: Date.now()
        };
        
        // 处理状态
        this.isProcessing = false;
        this.currentFilteredData = null;
        this.currentFieldMappings = {};
        this.currentFinalSummary = null;
        
        this.init();
    }
    
    init() {
        console.log('优化UI管理器初始化');
        this.bindEvents();
        this.updateUI();
        this.showStatus('优化版数据核算系统已就绪', 'success');
        
        // 显示优化特性
        setTimeout(() => {
            this.showStatus('⚡ 优化特性：流式处理 + 虚拟滚动 + 智能索引', 'info');
        }, 1000);
    }
    
    bindEvents() {
        // 绑定文件上传事件
        const fileInput = document.getElementById('fileInput');
        const dropArea = document.getElementById('uploadDropArea');
        
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                this.handleFileUpload(e.target.files);
            });
        }
        
        // 拖放功能
        if (dropArea) {
            dropArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropArea.style.borderColor = '#27ae60';
                dropArea.style.background = 'rgba(39, 174, 96, 0.1)';
            });
            
            dropArea.addEventListener('dragleave', () => {
                dropArea.style.borderColor = '#3498db';
                dropArea.style.background = 'rgba(52, 152, 219, 0.05)';
            });
            
            dropArea.addEventListener('drop', (e) => {
                e.preventDefault();
                dropArea.style.borderColor = '#3498db';
                dropArea.style.background = 'rgba(52, 152, 219, 0.05)';
                
                if (e.dataTransfer.files.length > 0) {
                    this.handleFileUpload(e.dataTransfer.files);
                }
            });
        }
        
        // 其他事件绑定...
        this.setupPerformanceMonitoring();
    }
    
    setupPerformanceMonitoring() {
        // 定期更新性能指标
        setInterval(() => {
            this.updatePerformanceMetrics();
        }, 3000);
    }
    
    updatePerformanceMetrics() {
        // 更新内存使用
        if (performance.memory) {
            const memory = performance.memory;
            const usedMB = Math.round(memory.usedJSHeapSize / 1024 / 1024);
            const totalMB = Math.round(memory.totalJSHeapSize / 1024 / 1024);
            const percent = Math.round((usedMB / totalMB) * 100);
            
            document.getElementById('memoryUsage').textContent = `${usedMB}MB / ${totalMB}MB`;
            
            // 根据内存使用情况更新引擎状态
            let engineStatus = '就绪';
            let engineColor = '#27ae60';
            
            if (percent > 90) {
                engineStatus = '内存告急';
                engineColor = '#e74c3c';
            } else if (percent > 70) {
                engineStatus = '高负载';
                engineColor = '#e67e22';
            } else if (this.isProcessing) {
                engineStatus = '处理中';
                engineColor = '#3498db';
            }
            
            document.getElementById('engineStatus').textContent = engineStatus;
            document.getElementById('engineStatus').style.color = engineColor;
        }
    }
    
    async handleFileUpload(files) {
        if (!files || files.length === 0) return;
        
        this.isProcessing = true;
        this.showLoader();
        this.showStatus(`开始流式处理 ${files.length} 个文件...`, 'info');
        
        // 获取处理选项
        const useStreaming = document.getElementById('useStreaming')?.checked ?? true;
        const useWebWorker = document.getElementById('useWebWorker')?.checked ?? true;
        const chunkSize = parseInt(document.getElementById('chunkSizeSelect')?.value || 1000);
        
        let successCount = 0;
        let errorFiles = [];
        
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const progress = Math.round(((i + 1) / files.length) * 100);
                
                this.showProgress(progress);
                this.showStatus(`流式处理 ${i + 1}/${files.length}: ${file.name}`, 'info');
                
                try {
                    const result = await this.fileProcessor.processFile(file, {
                        useStreaming,
                        chunkSize,
                        onProgress: (progressInfo) => {
                            this.updateProgressDetails(progressInfo, file.name);
                        }
                    });
                    
                    if (result.isZip) {
                        // 处理ZIP文件
                        for (const fileData of result.files) {
                            this.storage.addTable(fileData.name, fileData.data, {
                                isZip: true,
                                fileType: fileData.fileType,
                                processedWithStreaming: useStreaming
                            });
                            successCount++;
                        }
                    } else {
                        // 处理单个文件
                        this.storage.addTable(result.name, result.data, {
                            fileType: file.name.split('.').pop().toLowerCase(),
                            processedWithStreaming: useStreaming,
                            chunkSize,
                            processingTime: result.processingTime
                        });
                        successCount++;
                    }
                } catch (error) {
                    console.error('文件处理失败:', file.name, error);
                    errorFiles.push({ name: file.name, error: error.message });
                }
            }
            
            if (successCount > 0) {
                this.showStatus(`流式处理完成！成功导入 ${successCount} 个文件`, 'success');
            }
            
        } catch (error) {
            console.error('文件处理过程中出现错误:', error);
            this.showStatus(`处理过程中出现错误: ${error.message}`, 'error');
        } finally {
            this.isProcessing = false;
            this.hideProgress();
            this.updateUI();
            this.hideLoader();
            
            if (errorFiles.length > 0) {
                setTimeout(() => {
                    this.showDetailedErrorReport(errorFiles);
                }, 500);
            }
        }
    }
    
    updateProgressDetails(progressInfo, fileName) {
        const progressContainer = document.getElementById('progressContainer');
        const progressText = document.getElementById('progressText');
        const chunkInfo = document.getElementById('chunkInfo');
        
        if (progressContainer && progressText && chunkInfo) {
            progressContainer.style.display = 'block';
            
            if (progressInfo.chunk) {
                progressText.textContent = `处理 ${fileName} (${progressInfo.progress}%)`;
                chunkInfo.textContent = `块 ${progressInfo.chunk}/${progressInfo.totalChunks} - ${progressInfo.rowsProcessed}行`;
            } else {
                progressText.textContent = `处理 ${fileName} (${progressInfo.progress}%)`;
                chunkInfo.textContent = `${progressInfo.rowsProcessed}行`;
            }
            
            const progressBar = document.getElementById('progressBar');
            if (progressBar) {
                progressBar.style.width = `${progressInfo.progress}%`;
            }
        }
    }
    
    // 字段定义相关方法（优化版）
    async prepareFieldMapping() {
        if (!this.currentFilteredData || this.currentFilteredData.length === 0) {
            this.showStatus('没有数据可以进行字段映射', 'error');
            return;
        }
        
        this.showLoader();
        this.showStatus('正在提取唯一字段组合...', 'info');
        
        try {
            // 使用Web Worker在后台处理
            const uniqueCombinations = await this.extractUniqueCombinationsInWorker();
            
            this.allFieldCombinations = uniqueCombinations;
            this.filteredFieldCombinations = [...uniqueCombinations];
            
            // 显示字段定义模态框
            this.showFieldDefinitionModal();
            
        } catch (error) {
            console.error('准备字段映射失败:', error);
            this.showStatus(`准备字段映射失败: ${error.message}`, 'error');
        } finally {
            this.hideLoader();
        }
    }
    
    async extractUniqueCombinationsInWorker() {
        return new Promise((resolve) => {
            // 简化处理：直接在主线程计算
            const uniqueCombinations = new Map();
            
            this.currentFilteredData.forEach((row, index) => {
                const transactionDesc = row['Transaction Description'] || 
                                       row['Transaction_Description'] || 
                                       row['transaction_description'] || '';
                const amountType = row['Amount Type'] || 
                                  row['Amount_Type'] || 
                                  row['amount_type'] || 
                                  row['Type'] || '';
                
                if (transactionDesc && transactionDesc.trim() !== '') {
                    const key = `${transactionDesc}|${amountType}`;
                    
                    if (!uniqueCombinations.has(key)) {
                        const amount = parseFloat(row['Amount'] || row['amount'] || 0) || 0;
                        
                        uniqueCombinations.set(key, {
                            key,
                            transactionDesc,
                            amountType,
                            count: 1,
                            totalAmount: amount,
                            rows: [index]
                        });
                    } else {
                        const existing = uniqueCombinations.get(key);
                        existing.count++;
                        existing.totalAmount += parseFloat(row['Amount'] || row['amount'] || 0) || 0;
                        existing.rows.push(index);
                    }
                }
            });
            
            resolve(Array.from(uniqueCombinations.values()));
        });
    }
    
    showFieldDefinitionModal() {
        const modal = document.getElementById('fieldDefinitionModal');
        const countElement = document.getElementById('fieldMappingCount');
        
        if (!modal || !countElement) return;
        
        countElement.textContent = this.allFieldCombinations.length;
        
        // 显示一级分类
        this.renderPrimaryCategories();
        
        // 初始化虚拟滚动
        this.initVirtualScroll();
        
        // 更新分页信息
        this.updatePaginationInfo();
        
        modal.classList.add('active');
    }
    
    initVirtualScroll() {
        const container = document.getElementById('fieldMappingScrollContainer');
        if (!container) return;
        
        // 清空容器
        container.innerHTML = '';
        
        // 创建虚拟滚动实例
        this.virtualScroll = new VirtualScroll(container, {
            rowHeight: 45,
            bufferRows: 10,
            totalRows: this.filteredFieldCombinations.length,
            data: this.filteredFieldCombinations,
            renderRow: this.renderFieldMappingRow.bind(this)
        });
    }
    
    renderFieldMappingRow(field, index) {
        const actualIndex = (this.fieldMappingCurrentPage - 1) * this.fieldMappingPageSize + index;
        const savedMapping = this.storage.autoMatchField(field.transactionDesc, field.amountType);
        const guessedCategory = this.dataProcessor.guessPrimaryCategory(field.transactionDesc, field.amountType);
        
        return `
            <div style="display: flex; align-items: center; height: 100%; padding: 0 10px; border-bottom: 1px solid #eee;">
                <div style="width: 50px; text-align: center; color: #666;">${actualIndex + 1}</div>
                <div style="width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 10px;">
                    ${field.transactionDesc}
                </div>
                <div style="width: 150px; color: #7f8c8d; padding-right: 10px;">
                    ${field.amountType || ''}
                </div>
                <div style="width: 150px; padding-right: 10px;">
                    <select class="primary-category-select" data-index="${actualIndex}" 
                            style="width: 100%; padding: 5px; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
                        <option value="">请选择</option>
                        <option value="销售额" ${this.getSelectedAttr('销售额', savedMapping, guessedCategory)}>销售额</option>
                        <option value="广告费" ${this.getSelectedAttr('广告费', savedMapping, guessedCategory)}>广告费</option>
                        <option value="平台佣金" ${this.getSelectedAttr('平台佣金', savedMapping, guessedCategory)}>平台佣金</option>
                        <option value="仓储费用" ${this.getSelectedAttr('仓储费用', savedMapping, guessedCategory)}>仓储费用</option>
                        <option value="产品成本" ${this.getSelectedAttr('产品成本', savedMapping, guessedCategory)}>产品成本</option>
                        <option value="退货费用" ${this.getSelectedAttr('退货费用', savedMapping, guessedCategory)}>退货费用</option>
                        <option value="测评费用" ${this.getSelectedAttr('测评费用', savedMapping, guessedCategory)}>测评费用</option>
                        <option value="物流费" ${this.getSelectedAttr('物流费', savedMapping, guessedCategory)}>物流费</option>
                        <option value="__ignore__" ${savedMapping && savedMapping.primaryCategory === '__ignore__' ? 'selected' : ''}>忽略</option>
                    </select>
                </div>
                <div style="width: 200px; padding-right: 10px;">
                    <input type="text" class="subcategory-name-input" data-index="${actualIndex}"
                           value="${savedMapping ? savedMapping.subcategoryName : field.transactionDesc}" 
                           style="width: 100%; padding: 5px; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
                </div>
                <div style="width: 100px; text-align: center; color: #2c3e50; font-weight: bold;">
                    ${field.count}
                </div>
                <div style="width: 120px; text-align: right; color: #27ae60; font-weight: bold;">
                    ${this.formatCurrency(field.totalAmount)}
                </div>
            </div>
        `;
    }
    
    getSelectedAttr(category, savedMapping, guessedCategory) {
        if (savedMapping && savedMapping.primaryCategory === category) {
            return 'selected';
        }
        if (!savedMapping && guessedCategory === category) {
            return 'selected';
        }
        return '';
    }
    
    // 其他UI方法...
    updateUI() {
        this.updateTableList();
        this.updateProcessPanel();
        this.updateSummaryPanelSelectors();
    }
    
    updateTableList() {
        const container = document.getElementById('tableListContainer');
        const countElement = document.getElementById('tableCount');
        
        if (!container || !countElement) return;
        
        const tables = this.storage.getAllTables();
        countElement.textContent = tables.length;
        
        if (tables.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #7f8c8d; grid-column: 1 / -1;">
                    <i class="fas fa-table" style="font-size: 3rem; margin-bottom: 20px; opacity: 0.3;"></i>
                    <p>暂无数据表，请上传数据文件</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = tables.map(table => `
            <div class="table-card">
                <div class="table-header">
                    <div class="table-name">${table.name}</div>
                    <span style="font-size: 0.8rem; color: ${
                        table.isZip ? '#9b59b6' : 
                        table.name.includes('速猫订单') ? '#e74c3c' : 
                        table.name.includes('已处理') ? '#27ae60' :
                        table.name.includes('下单时间匹配') ? '#9b59b6' :
                        table.name.includes('数据汇总') ? '#e67e22' :
                        table.name.includes('筛选-') ? '#3498db' :
                        table.name.includes('汇总') ? '#3498db' :
                        '#7f8c8d'
                    };">
                        ${
                            table.isZip ? 'ZIP' : 
                            table.name.includes('速猫订单') ? '订单' : 
                            table.name.includes('已处理') ? '已处理' :
                            table.name.includes('下单时间匹配') ? '匹配表' :
                            table.name.includes('数据汇总') ? '汇总表' :
                            table.name.includes('筛选-') ? '筛选表' :
                            table.name.includes('汇总') ? '汇总' :
                            '表格'
                        }
                        ${table.processedWithStreaming ? ' ⚡' : ''}
                    </span>
                </div>
                <div style="color: #7f8c8d; margin: 10px 0; font-size: 0.9rem;">
                    ${table.columns.length} 列 × ${table.rowCount} 行
                    ${table.fileType ? ` (${table.fileType.toUpperCase()})` : ''}
                    ${table.isCompressed ? ' 🔒' : ''}
                </div>
                <div style="color: #95a5a6; font-size: 0.85rem; margin-top: 8px;">
                    ${new Date(table.createdAt).toLocaleDateString()} 创建
                </div>
                <div class="table-tools">
                    <button class="tool-btn" onclick="ui.previewTable('${table.id}')">
                        <i class="fas fa-eye"></i> 预览
                    </button>
                    <button class="tool-btn" onclick="ui.exportTable('${table.id}')">
                        <i class="fas fa-download"></i> 导出
                    </button>
                    <button class="tool-btn" onclick="ui.deleteTable('${table.id}')">
                        <i class="fas fa-trash"></i> 删除
                    </button>
                </div>
            </div>
        `).join('');
    }
    
    // 其他方法的实现...
    // 由于代码长度限制，这里只展示核心优化部分
    // 完整实现需要包含所有UI交互方法
    
    // 工具方法
    showStatus(message, type = 'info', allowHtml = false) {
        const statusElement = document.getElementById('statusMessage');
        if (!statusElement) return;
        
        if (allowHtml) {
            statusElement.innerHTML = message;
        } else {
            statusElement.textContent = message;
        }
        
        statusElement.className = `status-message ${type}`;
        statusElement.style.display = 'block';
        
        setTimeout(() => {
            statusElement.style.display = 'none';
        }, 5000);
    }
    
    showLoader() {
        const loader = document.getElementById('loader');
        if (loader) {
            loader.classList.add('active');
        }
    }
    
    hideLoader() {
        const loader = document.getElementById('loader');
        if (loader) {
            loader.classList.remove('active');
        }
    }
    
    showProgress(percent) {
        const progressContainer = document.getElementById('progressContainer');
        const progressBar = document.getElementById('progressBar');
        
        if (progressContainer && progressBar) {
            progressContainer.style.display = 'block';
            progressBar.style.width = percent + '%';
        }
    }
    
    hideProgress() {
        const progressContainer = document.getElementById('progressContainer');
        if (progressContainer) {
            progressContainer.style.display = 'none';
        }
    }
    
    formatCurrency(amount) {
        if (amount === null || amount === undefined) return '$0.00';
        
        const num = parseFloat(amount);
        if (isNaN(num)) return '$0.00';
        
        const isNegative = num < 0;
        const absNum = Math.abs(num);
        
        const formatted = '$' + absNum.toLocaleString('zh-CN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        
        return isNegative ? '-' + formatted : formatted;
    }
    
    // 获取索引数量（用于性能监控）
    getIndexCount() {
        return this.storage.getIndexCount();
    }
}