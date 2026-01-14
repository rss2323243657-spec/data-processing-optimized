// 优化字段定义组件
class FieldDefinitionOptimized {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.options = {
            pageSize: 100,
            enableVirtualScroll: true,
            enableSearch: true,
            enableBatchOperations: true,
            enableIndexing: true,
            ...options
        };
        
        this.data = [];
        this.filteredData = [];
        this.currentPage = 1;
        this.totalPages = 1;
        
        this.virtualScroll = null;
        this.searchWorker = null;
        this.indexWorker = null;
        
        this.selectedCategories = new Set();
        this.batchOperations = [];
        
        this.init();
    }
    
    async init() {
        // 初始化容器
        this.renderContainer();
        
        // 初始化Web Workers
        if (this.options.enableIndexing && window.Worker) {
            this.initWorkers();
        }
        
        // 绑定事件
        this.bindEvents();
        
        console.log('优化字段定义组件初始化完成');
    }
    
    renderContainer() {
        this.container.innerHTML = `
            <div class="optimized-field-definition">
                <!-- 工具栏 -->
                <div class="toolbar">
                    <div class="search-box">
                        <input type="text" class="search-input" placeholder="搜索Transaction Description...">
                        <button class="search-btn">
                            <i class="fas fa-search"></i>
                        </button>
                    </div>
                    
                    <div class="toolbar-actions">
                        <button class="btn btn-primary" id="batchAssignBtn">
                            <i class="fas fa-bolt"></i> 批量分配
                        </button>
                        <button class="btn btn-secondary" id="autoMapBtn">
                            <i class="fas fa-magic"></i> 智能匹配
                        </button>
                        <button class="btn btn-success" id="exportBtn">
                            <i class="fas fa-download"></i> 导出
                        </button>
                    </div>
                </div>
                
                <!-- 分类筛选器 -->
                <div class="category-filter">
                    <div class="filter-header">
                        <i class="fas fa-filter"></i>
                        <span>分类筛选</span>
                    </div>
                    <div class="filter-options" id="categoryFilterOptions">
                        <!-- 分类选项动态生成 -->
                    </div>
                </div>
                
                <!-- 虚拟滚动容器 -->
                <div class="virtual-scroll-area" id="virtualScrollArea">
                    <div class="loading-indicator" id="loadingIndicator">
                        <div class="spinner"></div>
                        <span>加载中...</span>
                    </div>
                </div>
                
                <!-- 分页控件 -->
                <div class="pagination" id="paginationControls">
                    <button class="page-btn prev-btn" disabled>
                        <i class="fas fa-chevron-left"></i>
                    </button>
                    <span class="page-info">第1页 / 共1页</span>
                    <button class="page-btn next-btn" disabled>
                        <i class="fas fa-chevron-right"></i>
                    </button>
                    <select class="page-size-select">
                        <option value="50">50行/页</option>
                        <option value="100" selected>100行/页</option>
                        <option value="200">200行/页</option>
                        <option value="500">500行/页</option>
                    </select>
                </div>
                
                <!-- 批量操作面板 -->
                <div class="batch-panel" id="batchPanel" style="display: none;">
                    <div class="batch-header">
                        <h4><i class="fas fa-tasks"></i> 批量操作</h4>
                        <button class="close-btn" id="closeBatchPanel">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="batch-content">
                        <div class="batch-option">
                            <label>设置一级分类：</label>
                            <select id="batchPrimaryCategory">
                                <option value="">请选择分类</option>
                                <option value="销售额">销售额</option>
                                <option value="广告费">广告费</option>
                                <option value="平台佣金">平台佣金</option>
                                <option value="仓储费用">仓储费用</option>
                                <option value="产品成本">产品成本</option>
                                <option value="退货费用">退货费用</option>
                                <option value="测评费用">测评费用</option>
                                <option value="物流费">物流费</option>
                                <option value="__ignore__">忽略</option>
                            </select>
                        </div>
                        <div class="batch-option">
                            <label>设置二级分类名称：</label>
                            <input type="text" id="batchSubcategory" placeholder="输入自定义二级分类名称">
                        </div>
                        <button class="btn btn-primary" id="applyBatchBtn">
                            <i class="fas fa-check"></i> 应用批量操作
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // 初始化虚拟滚动
        if (this.options.enableVirtualScroll) {
            this.initVirtualScroll();
        }
    }
    
    initVirtualScroll() {
        const scrollArea = document.getElementById('virtualScrollArea');
        if (!scrollArea) return;
        
        this.virtualScroll = new VirtualScroll(scrollArea, {
            rowHeight: 45,
            bufferRows: 10,
            renderRow: this.renderFieldRow.bind(this)
        });
    }
    
    initWorkers() {
        // 初始化搜索Worker
        this.searchWorker = new Worker('./js/workers/search-worker.js');
        this.searchWorker.onmessage = this.handleSearchResults.bind(this);
        
        // 初始化索引Worker
        this.indexWorker = new Worker('./js/workers/index-worker.js');
        this.indexWorker.onmessage = this.handleIndexResults.bind(this);
    }
    
    bindEvents() {
        // 搜索事件
        const searchInput = this.container.querySelector('.search-input');
        const searchBtn = this.container.querySelector('.search-btn');
        
        if (searchInput) {
            searchInput.addEventListener('input', this.debounce(() => {
                this.searchFields(searchInput.value);
            }, 300));
        }
        
        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                this.searchFields(searchInput.value);
            });
        }
        
        // 分页事件
        const prevBtn = this.container.querySelector('.prev-btn');
        const nextBtn = this.container.querySelector('.next-btn');
        const pageSizeSelect = this.container.querySelector('.page-size-select');
        
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                this.prevPage();
            });
        }
        
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                this.nextPage();
            });
        }
        
        if (pageSizeSelect) {
            pageSizeSelect.addEventListener('change', (e) => {
                this.changePageSize(parseInt(e.target.value));
            });
        }
        
        // 批量操作事件
        const batchAssignBtn = document.getElementById('batchAssignBtn');
        const autoMapBtn = document.getElementById('autoMapBtn');
        const exportBtn = document.getElementById('exportBtn');
        const closeBatchPanel = document.getElementById('closeBatchPanel');
        const applyBatchBtn = document.getElementById('applyBatchBtn');
        
        if (batchAssignBtn) {
            batchAssignBtn.addEventListener('click', () => {
                this.showBatchPanel();
            });
        }
        
        if (autoMapBtn) {
            autoMapBtn.addEventListener('click', () => {
                this.autoMapFields();
            });
        }
        
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.exportMappings();
            });
        }
        
        if (closeBatchPanel) {
            closeBatchPanel.addEventListener('click', () => {
                this.hideBatchPanel();
            });
        }
        
        if (applyBatchBtn) {
            applyBatchBtn.addEventListener('click', () => {
                this.applyBatchOperations();
            });
        }
    }
    
    async loadData(data) {
        this.showLoading();
        
        // 处理数据
        this.data = this.processFieldData(data);
        this.filteredData = [...this.data];
        
        // 构建索引
        if (this.options.enableIndexing && this.indexWorker) {
            await this.buildIndexes(this.data);
        }
        
        // 更新分页
        this.updatePagination();
        
        // 渲染数据
        this.renderData();
        
        // 渲染分类筛选器
        this.renderCategoryFilter();
        
        this.hideLoading();
    }
    
    processFieldData(data) {
        const fieldMap = new Map();
        
        data.forEach((row, index) => {
            const transactionDesc = row['Transaction Description'] || 
                                   row['Transaction_Description'] || 
                                   row['transaction_description'] || '';
            const amountType = row['Amount Type'] || 
                              row['Amount_Type'] || 
                              row['amount_type'] || 
                              row['Type'] || '';
            const amount = parseFloat(row['Amount'] || row['amount'] || 0) || 0;
            
            if (!transactionDesc) return;
            
            const key = `${transactionDesc}|${amountType}`;
            
            if (!fieldMap.has(key)) {
                fieldMap.set(key, {
                    id: `field_${index}`,
                    key,
                    transactionDesc,
                    amountType,
                    count: 1,
                    totalAmount: amount,
                    rows: [index],
                    primaryCategory: '',
                    subcategoryName: transactionDesc,
                    customSubcategoryName: '',
                    isSelected: false,
                    isModified: false
                });
            } else {
                const existing = fieldMap.get(key);
                existing.count++;
                existing.totalAmount += amount;
                existing.rows.push(index);
            }
        });
        
        return Array.from(fieldMap.values());
    }
    
    async buildIndexes(data) {
        return new Promise((resolve) => {
            if (!this.indexWorker) {
                resolve(null);
                return;
            }
            
            this.indexWorker.onmessage = (e) => {
                if (e.data.type === 'indexComplete') {
                    this.indexes = e.data.indexes;
                    console.log('索引构建完成:', this.indexes.stats);
                    resolve(this.indexes);
                }
            };
            
            this.indexWorker.postMessage({
                type: 'buildIndex',
                data: data.map(item => ({
                    transactionDesc: item.transactionDesc,
                    amountType: item.amountType,
                    amount: item.totalAmount,
                    primaryCategory: item.primaryCategory
                })),
                options: {
                    batchSize: 1000,
                    reportProgress: true
                }
            });
        });
    }
    
    searchFields(searchTerm) {
        if (!searchTerm.trim()) {
            this.filteredData = [...this.data];
            this.currentPage = 1;
            this.renderData();
            return;
        }
        
        if (this.options.enableIndexing && this.searchWorker && this.indexes) {
            // 使用索引搜索
            this.searchWorker.postMessage({
                type: 'search',
                data: this.data,
                options: {
                    query: searchTerm,
                    indexes: this.indexes
                }
            });
        } else {
            // 普通搜索
            const term = searchTerm.toLowerCase();
            this.filteredData = this.data.filter(item => 
                item.transactionDesc.toLowerCase().includes(term) ||
                (item.amountType && item.amountType.toLowerCase().includes(term))
            );
            this.currentPage = 1;
            this.renderData();
        }
    }
    
    handleSearchResults(e) {
        if (e.data.type === 'searchComplete') {
            this.filteredData = e.data.results;
            this.currentPage = 1;
            this.renderData();
            
            // 显示搜索结果统计
            this.showStatus(`找到 ${e.data.resultCount} 个匹配项`, 'info');
        }
    }
    
    handleIndexResults(e) {
        switch(e.data.type) {
            case 'indexComplete':
                this.indexes = e.data.indexes;
                break;
                
            case 'progress':
                this.updateProgress(e.data.progress);
                break;
        }
    }
    
    renderData() {
        if (!this.virtualScroll) return;
        
        const startIndex = (this.currentPage - 1) * this.options.pageSize;
        const endIndex = startIndex + this.options.pageSize;
        const pageData = this.filteredData.slice(startIndex, endIndex);
        
        this.virtualScroll.updateData(pageData);
        this.updatePaginationInfo();
    }
    
    renderFieldRow(field, index) {
        const actualIndex = (this.currentPage - 1) * this.options.pageSize + index;
        
        return `
            <div class="field-row ${field.isSelected ? 'selected' : ''} ${field.isModified ? 'modified' : ''}" 
                 data-index="${actualIndex}" data-key="${field.key}">
                <div class="field-cell cell-checkbox">
                    <input type="checkbox" class="row-checkbox" ${field.isSelected ? 'checked' : ''}>
                </div>
                <div class="field-cell cell-index">${actualIndex + 1}</div>
                <div class="field-cell cell-desc" title="${field.transactionDesc}">
                    ${this.truncateText(field.transactionDesc, 40)}
                </div>
                <div class="field-cell cell-type" title="${field.amountType || ''}">
                    ${field.amountType || ''}
                </div>
                <div class="field-cell cell-category">
                    <select class="category-select" data-key="${field.key}">
                        <option value="">请选择</option>
                        <option value="销售额" ${field.primaryCategory === '销售额' ? 'selected' : ''}>销售额</option>
                        <option value="广告费" ${field.primaryCategory === '广告费' ? 'selected' : ''}>广告费</option>
                        <option value="平台佣金" ${field.primaryCategory === '平台佣金' ? 'selected' : ''}>平台佣金</option>
                        <option value="仓储费用" ${field.primaryCategory === '仓储费用' ? 'selected' : ''}>仓储费用</option>
                        <option value="产品成本" ${field.primaryCategory === '产品成本' ? 'selected' : ''}>产品成本</option>
                        <option value="退货费用" ${field.primaryCategory === '退货费用' ? 'selected' : ''}>退货费用</option>
                        <option value="测评费用" ${field.primaryCategory === '测评费用' ? 'selected' : ''}>测评费用</option>
                        <option value="物流费" ${field.primaryCategory === '物流费' ? 'selected' : ''}>物流费</option>
                        <option value="__ignore__" ${field.primaryCategory === '__ignore__' ? 'selected' : ''}>忽略</option>
                    </select>
                </div>
                <div class="field-cell cell-subcategory">
                    <input type="text" class="subcategory-input" data-key="${field.key}"
                           value="${field.customSubcategoryName || field.transactionDesc}"
                           placeholder="自定义二级分类">
                </div>
                <div class="field-cell cell-count">
                    <span class="count-badge">${field.count}</span>
                </div>
                <div class="field-cell cell-amount">
                    ${this.formatCurrency(field.totalAmount)}
                </div>
                <div class="field-cell cell-actions">
                    <button class="action-btn apply-btn" title="应用到相同描述">
                        <i class="fas fa-copy"></i>
                    </button>
                </div>
            </div>
        `;
    }
    
    renderCategoryFilter() {
        const container = document.getElementById('categoryFilterOptions');
        if (!container) return;
        
        const categories = [
            { value: '销售额', color: '#3498db' },
            { value: '广告费', color: '#e74c3c' },
            { value: '平台佣金', color: '#2ecc71' },
            { value: '仓储费用', color: '#9b59b6' },
            { value: '产品成本', color: '#e67e22' },
            { value: '退货费用', color: '#1abc9c' },
            { value: '测评费用', color: '#34495e' },
            { value: '物流费', color: '#f39c12' },
            { value: '__ignore__', color: '#95a5a6', label: '忽略' }
        ];
        
        container.innerHTML = categories.map(cat => `
            <label class="filter-option ${this.selectedCategories.has(cat.value) ? 'active' : ''}" 
                   style="--category-color: ${cat.color}">
                <input type="checkbox" value="${cat.value}" 
                       ${this.selectedCategories.has(cat.value) ? 'checked' : ''}>
                <span class="filter-label">${cat.label || cat.value}</span>
                <span class="filter-count" id="count_${cat.value}">0</span>
            </label>
        `).join('');
        
        // 更新分类计数
        this.updateCategoryCounts();
        
        // 绑定筛选事件
        container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const value = e.target.value;
                if (e.target.checked) {
                    this.selectedCategories.add(value);
                } else {
                    this.selectedCategories.delete(value);
                }
                this.applyCategoryFilter();
            });
        });
    }
    
    updateCategoryCounts() {
        const categoryCounts = {};
        
        this.data.forEach(field => {
            const category = field.primaryCategory || '未分类';
            categoryCounts[category] = (categoryCounts[category] || 0) + 1;
        });
        
        Object.entries(categoryCounts).forEach(([category, count]) => {
            const countElement = document.getElementById(`count_${category}`);
            if (countElement) {
                countElement.textContent = count;
            }
        });
    }
    
    applyCategoryFilter() {
        if (this.selectedCategories.size === 0) {
            this.filteredData = [...this.data];
        } else {
            this.filteredData = this.data.filter(field => 
                this.selectedCategories.has(field.primaryCategory || '未分类')
            );
        }
        
        this.currentPage = 1;
        this.renderData();
    }
    
    prevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.renderData();
            this.updatePaginationButtons();
        }
    }
    
    nextPage() {
        if (this.currentPage < this.totalPages) {
            this.currentPage++;
            this.renderData();
            this.updatePaginationButtons();
        }
    }
    
    changePageSize(size) {
        this.options.pageSize = size;
        this.currentPage = 1;
        this.updatePagination();
        this.renderData();
    }
    
    updatePagination() {
        this.totalPages = Math.ceil(this.filteredData.length / this.options.pageSize);
        this.updatePaginationInfo();
        this.updatePaginationButtons();
    }
    
    updatePaginationInfo() {
        const pageInfo = this.container.querySelector('.page-info');
        if (pageInfo) {
            const startIndex = (this.currentPage - 1) * this.options.pageSize + 1;
            const endIndex = Math.min(startIndex + this.options.pageSize - 1, this.filteredData.length);
            pageInfo.textContent = `第${this.currentPage}页 / 共${this.totalPages}页 (${startIndex}-${endIndex} / ${this.filteredData.length})`;
        }
    }
    
    updatePaginationButtons() {
        const prevBtn = this.container.querySelector('.prev-btn');
        const nextBtn = this.container.querySelector('.next-btn');
        
        if (prevBtn) {
            prevBtn.disabled = this.currentPage <= 1;
        }
        
        if (nextBtn) {
            nextBtn.disabled = this.currentPage >= this.totalPages;
        }
    }
    
    showBatchPanel() {
        const batchPanel = document.getElementById('batchPanel');
        if (batchPanel) {
            batchPanel.style.display = 'block';
        }
    }
    
    hideBatchPanel() {
        const batchPanel = document.getElementById('batchPanel');
        if (batchPanel) {
            batchPanel.style.display = 'none';
        }
    }
    
    async autoMapFields() {
        this.showLoading();
        
        try {
            // 使用Web Worker进行智能匹配
            const mappingWorker = new Worker('./js/workers/mapping-worker.js');
            
            mappingWorker.onmessage = (e) => {
                if (e.data.type === 'rulesCompiled') {
                    // 应用匹配规则到当前页数据
                    this.applyAutoMappings(e.data.rules);
                    mappingWorker.terminate();
                }
            };
            
            // 发送默认规则进行编译
            mappingWorker.postMessage({
                type: 'compileRules',
                rules: {
                    patterns: [
                        { name: '销售额', pattern: 'sale|销售|订单|revenue', category: '销售额' },
                        { name: '广告费', pattern: 'ad|广告|sponsored|promotion', category: '广告费' },
                        { name: '平台佣金', pattern: 'commission|fee|佣金|平台费|service', category: '平台佣金' },
                        { name: '仓储费用', pattern: 'storage|warehouse|仓储|库存', category: '仓储费用' },
                        { name: '产品成本', pattern: 'product|cost|产品|采购|inventory', category: '产品成本' },
                        { name: '退货费用', pattern: 'return|refund|退货|退款', category: '退货费用' },
                        { name: '测评费用', pattern: 'review|test|测评|评价|vine', category: '测评费用' },
                        { name: '物流费', pattern: 'shipping|logistics|物流|运费|delivery', category: '物流费' }
                    ],
                    defaultCategory: ''
                }
            });
            
        } catch (error) {
            console.error('智能匹配失败:', error);
            this.showStatus('智能匹配失败: ' + error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }
    
    applyAutoMappings(rules) {
        const startIndex = (this.currentPage - 1) * this.options.pageSize;
        const endIndex = startIndex + this.options.pageSize;
        const pageData = this.filteredData.slice(startIndex, endIndex);
        
        let matchedCount = 0;
        
        pageData.forEach((field, index) => {
            // 这里应该调用applyMappingRules函数
            // 简化处理：使用简单的关键词匹配
            const descLower = field.transactionDesc.toLowerCase();
            
            if (descLower.includes('sale') || descLower.includes('销售')) {
                field.primaryCategory = '销售额';
                matchedCount++;
            } else if (descLower.includes('ad') || descLower.includes('广告')) {
                field.primaryCategory = '广告费';
                matchedCount++;
            } else if (descLower.includes('commission') || descLower.includes('佣金')) {
                field.primaryCategory = '平台佣金';
                matchedCount++;
            }
            // 其他匹配规则...
        });
        
        this.showStatus(`智能匹配完成，匹配了 ${matchedCount} 个字段`, 'success');
        this.renderData();
        this.updateCategoryCounts();
    }
    
    applyBatchOperations() {
        const primaryCategory = document.getElementById('batchPrimaryCategory').value;
        const subcategory = document.getElementById('batchSubcategory').value;
        
        if (!primaryCategory) {
            this.showStatus('请选择一级分类', 'error');
            return;
        }
        
        const startIndex = (this.currentPage - 1) * this.options.pageSize;
        const endIndex = startIndex + this.options.pageSize;
        const pageData = this.filteredData.slice(startIndex, endIndex);
        
        let appliedCount = 0;
        
        pageData.forEach((field, index) => {
            field.primaryCategory = primaryCategory;
            if (subcategory) {
                field.customSubcategoryName = subcategory;
            }
            field.isModified = true;
            appliedCount++;
        });
        
        this.showStatus(`批量操作完成，应用到 ${appliedCount} 个字段`, 'success');
        this.renderData();
        this.updateCategoryCounts();
        this.hideBatchPanel();
    }
    
    exportMappings() {
        try {
            const exportData = this.data.map(field => ({
                'Transaction Description': field.transactionDesc,
                'Amount Type': field.amountType,
                '一级分类': field.primaryCategory || '',
                '原始二级分类名称': field.transactionDesc,
                '自定义二级分类名称': field.customSubcategoryName || field.transactionDesc,
                '出现次数': field.count,
                '总金额': field.totalAmount
            }));
            
            const ws = XLSX.utils.json_to_sheet(exportData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, '字段映射');
            
            const fileName = `字段映射-${new Date().toISOString().slice(0, 10)}.xlsx`;
            XLSX.writeFile(wb, fileName);
            
            this.showStatus(`字段映射已导出: ${fileName}`, 'success');
            
        } catch (error) {
            console.error('导出失败:', error);
            this.showStatus(`导出失败: ${error.message}`, 'error');
        }
    }
    
    // 工具方法
    showLoading() {
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'flex';
        }
    }
    
    hideLoading() {
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
    }
    
    showStatus(message, type = 'info') {
        // 这里可以实现状态提示
        console.log(`${type}: ${message}`);
    }
    
    updateProgress(progress) {
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) {
            const spinner = loadingIndicator.querySelector('.spinner');
            const text = loadingIndicator.querySelector('span');
            
            if (text) {
                text.textContent = `处理中... ${progress}%`;
            }
        }
    }
    
    truncateText(text, maxLength) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
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
    
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    // 获取当前数据
    getCurrentData() {
        return {
            allData: this.data,
            filteredData: this.filteredData,
            pageData: this.filteredData.slice(
                (this.currentPage - 1) * this.options.pageSize,
                this.currentPage * this.options.pageSize
            ),
            totalFields: this.data.length,
            filteredFields: this.filteredData.length,
            currentPage: this.currentPage,
            totalPages: this.totalPages
        };
    }
    
    // 获取映射结果
    getMappings() {
        const mappings = {};
        
        this.data.forEach(field => {
            if (field.primaryCategory) {
                mappings[field.key] = {
                    primaryCategory: field.primaryCategory,
                    subcategoryName: field.customSubcategoryName || field.transactionDesc,
                    transactionDesc: field.transactionDesc,
                    amountType: field.amountType
                };
            }
        });
        
        return mappings;
    }
    
    // 销毁组件
    destroy() {
        if (this.searchWorker) {
            this.searchWorker.terminate();
        }
        
        if (this.indexWorker) {
            this.indexWorker.terminate();
        }
        
        if (this.virtualScroll) {
            this.virtualScroll.destroy();
        }
        
        this.container.innerHTML = '';
    }
}