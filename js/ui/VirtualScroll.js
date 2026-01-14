// 虚拟滚动组件
class VirtualScroll {
    constructor(container, options = {}) {
        this.container = container;
        this.rowHeight = options.rowHeight || 40;
        this.bufferRows = options.bufferRows || 5;
        this.totalRows = options.totalRows || 0;
        this.data = options.data || [];
        this.renderRow = options.renderRow || this.defaultRenderRow;
        
        this.scrollWrapper = null;
        this.scrollContent = null;
        this.visibleRows = new Map();
        this.startIndex = 0;
        this.endIndex = 0;
        this.renderedRange = { start: 0, end: 0 };
        
        this.scrollTop = 0;
        this.containerHeight = 0;
        
        this.init();
    }
    
    init() {
        // 创建虚拟滚动容器
        this.container.innerHTML = '';
        
        this.scrollWrapper = document.createElement('div');
        this.scrollWrapper.className = 'virtual-scroll-wrapper';
        this.scrollWrapper.style.cssText = `
            height: 100%;
            overflow-y: auto;
            position: relative;
        `;
        
        this.scrollContent = document.createElement('div');
        this.scrollContent.className = 'virtual-scroll-content';
        this.scrollContent.style.cssText = `
            position: relative;
            height: ${this.totalRows * this.rowHeight}px;
        `;
        
        this.scrollWrapper.appendChild(this.scrollContent);
        this.container.appendChild(this.scrollWrapper);
        
        this.setupEvents();
        this.updateContainerHeight();
        this.renderVisibleRows();
    }
    
    setupEvents() {
        // 使用防抖处理滚动事件
        this.handleScroll = this.debounce(this.handleScroll.bind(this), 16);
        this.scrollWrapper.addEventListener('scroll', this.handleScroll);
        
        // 监听容器大小变化
        this.resizeObserver = new ResizeObserver(() => {
            this.updateContainerHeight();
            this.calculateVisibleRange();
            this.renderVisibleRows();
        });
        
        this.resizeObserver.observe(this.container);
    }
    
    updateContainerHeight() {
        this.containerHeight = this.scrollWrapper.clientHeight;
    }
    
    handleScroll() {
        this.scrollTop = this.scrollWrapper.scrollTop;
        this.calculateVisibleRange();
        
        // 检查是否需要重新渲染
        if (this.shouldRerender()) {
            this.renderVisibleRows();
        }
    }
    
    calculateVisibleRange() {
        const visibleStart = Math.floor(this.scrollTop / this.rowHeight);
        const visibleEnd = Math.ceil((this.scrollTop + this.containerHeight) / this.rowHeight);
        
        this.startIndex = Math.max(0, visibleStart - this.bufferRows);
        this.endIndex = Math.min(this.totalRows, visibleEnd + this.bufferRows);
    }
    
    shouldRerender() {
        const { start, end } = this.renderedRange;
        return this.startIndex < start || this.endIndex > end;
    }
    
    renderVisibleRows() {
        // 记录新的渲染范围
        this.renderedRange = { start: this.startIndex, end: this.endIndex };
        
        // 收集需要移除的行
        const rowsToRemove = [];
        this.visibleRows.forEach((row, index) => {
            if (index < this.startIndex || index >= this.endIndex) {
                rowsToRemove.push(index);
            }
        });
        
        // 移除不可见的行
        rowsToRemove.forEach(index => {
            const row = this.visibleRows.get(index);
            if (row && row.element) {
                row.element.remove();
            }
            this.visibleRows.delete(index);
        });
        
        // 渲染新的可见行
        for (let i = this.startIndex; i < this.endIndex; i++) {
            if (i >= this.totalRows) break;
            
            if (!this.visibleRows.has(i)) {
                const rowData = this.data[i];
                if (rowData) {
                    const row = this.createRow(i, rowData);
                    this.visibleRows.set(i, row);
                    this.scrollContent.appendChild(row.element);
                }
            }
        }
    }
    
    createRow(index, rowData) {
        const rowElement = document.createElement('div');
        rowElement.className = 'virtual-row';
        rowElement.style.cssText = `
            position: absolute;
            top: ${index * this.rowHeight}px;
            height: ${this.rowHeight}px;
            width: 100%;
            box-sizing: border-box;
            border-bottom: 1px solid #eee;
            background: white;
        `;
        
        rowElement.innerHTML = this.renderRow(rowData, index);
        
        return {
            index,
            element: rowElement,
            data: rowData
        };
    }
    
    defaultRenderRow(rowData, index) {
        return `
            <div style="display: flex; align-items: center; height: 100%; padding: 0 10px;">
                <div style="width: 50px; text-align: center; color: #666;">${index + 1}</div>
                <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${rowData.transactionDesc || ''}
                </div>
                <div style="width: 100px; text-align: center; color: #7f8c8d;">
                    ${rowData.amountType || ''}
                </div>
                <div style="width: 120px; text-align: right; font-weight: bold; color: #2c3e50;">
                    ${this.formatCurrency(rowData.amount || 0)}
                </div>
            </div>
        `;
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
    
    updateData(newData) {
        this.data = newData;
        this.totalRows = newData.length;
        
        // 更新内容高度
        this.scrollContent.style.height = `${this.totalRows * this.rowHeight}px`;
        
        // 清除所有可见行
        this.visibleRows.forEach(row => {
            if (row.element) {
                row.element.remove();
            }
        });
        this.visibleRows.clear();
        
        // 重新渲染
        this.calculateVisibleRange();
        this.renderVisibleRows();
    }
    
    updateRow(index, newData) {
        const row = this.visibleRows.get(index);
        if (row) {
            row.data = newData;
            row.element.innerHTML = this.renderRow(newData, index);
        }
    }
    
    scrollToIndex(index) {
        const scrollTop = index * this.rowHeight;
        this.scrollWrapper.scrollTop = scrollTop;
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
    
    destroy() {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        
        if (this.scrollWrapper) {
            this.scrollWrapper.removeEventListener('scroll', this.handleScroll);
        }
        
        this.visibleRows.clear();
        this.container.innerHTML = '';
    }
    
    // 性能优化：批量更新
    batchUpdate(updates) {
        // 暂停渲染
        const originalHandleScroll = this.handleScroll;
        this.handleScroll = () => {};
        
        // 应用更新
        updates.forEach(({ index, data }) => {
            this.updateRow(index, data);
        });
        
        // 恢复渲染
        setTimeout(() => {
            this.handleScroll = originalHandleScroll;
            this.renderVisibleRows();
        }, 0);
    }
}