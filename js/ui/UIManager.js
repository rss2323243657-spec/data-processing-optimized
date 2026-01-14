class UIManager {
    constructor() {
        this.currentPanel = 'upload';
        this.isInitialized = false;
        this.eventListeners = new Map();
    }

    // 初始化UI
    init() {
        if (this.isInitialized) return;
        
        this.bindEvents();
        this.updateAllPanels();
        this.isInitialized = true;
        
        console.log('UI管理器初始化完成');
    }

    // 绑定事件
    bindEvents() {
        // 导航点击事件
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const onclick = item.getAttribute('onclick');
                if (onclick && onclick.includes("showPanel('")) {
                    const panelId = onclick.match(/showPanel\('([^']+)'/)[1];
                    this.showPanel(panelId);
                }
            });
        });

        // 文件上传事件
        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.addEventListener('change', this.handleFileSelect.bind(this));
        }

        // 拖放事件
        this.initFileDrop();

        // 处理面板事件
        this.bindProcessPanelEvents();
    }

    // 显示面板
    showPanel(panelId) {
        // 更新导航
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const navItem = document.querySelector(`.nav-item[onclick*="'${panelId}'"]`);
        if (navItem) {
            navItem.classList.add('active');
        }

        // 显示对应面板
        document.querySelectorAll('.content-panel').forEach(panel => {
            panel.classList.remove('active');
        });
        
        const targetPanel = document.getElementById(panelId + 'Panel');
        if (targetPanel) {
            targetPanel.classList.add('active');
            this.currentPanel = panelId;
            
            // 更新面板内容
            this.updatePanel(panelId);
        }
    }

    // 更新面板
    updatePanel(panelId) {
        switch (panelId) {
            case 'tables':
                this.updateTablesPanel();
                break;
            case 'process':
                this.updateProcessPanel();
                break;
            case 'merge':
                this.updateMergePanel();
                break;
        }
    }

    // 更新所有面板
    updateAllPanels() {
        this.updateTablesPanel();
        this.updateProcessPanel();
        this.updateMergePanel();
    }

    // 更新表格管理面板
    updateTablesPanel() {
        const container = document.getElementById('tableListContainer');
        if (!container) return;
        
        const tables = dataStorage.getAllTables();
        
        // 更新表格数量
        const tableCount = document.getElementById('tableCount');
        if (tableCount) {
            tableCount.textContent = tables.length;
        }
        
        if (tables.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 50px; color: #7f8c8d; grid-column: 1 / -1;">
                    <i class="fas fa-table" style="font-size: 48px; margin-bottom: 20px;"></i>
                    <p>暂无数据表，请先上传文件</p>
                </div>
            `;
            return;
        }
        
        // 生成表格卡片
        container.innerHTML = '';
        tables.forEach((table, index) => {
            const card = document.createElement('div');
            card.className = 'table-card';
            card.innerHTML = `
                <div class="table-card-header">
                    <h4 title="${table.name}">${this.truncateText(table.name, 30)}</h4>
                    <span class="table-badge">${table.data.length}行</span>
                </div>
                <div class="table-card-body">
                    <p><i class="fas fa-columns"></i> 列数: ${table.columns.length}</p>
                    <p><i class="fas fa-calendar"></i> 创建时间: ${new Date(table.metadata.created).toLocaleString()}</p>
                </div>
                <div class="table-card-actions">
                    <button class="action-btn" onclick="uiManager.previewTable('${table.id}')">
                        <i class="fas fa-eye"></i> 预览
                    </button>
                    <button class="action-btn" onclick="uiManager.exportTable('${table.id}')">
                        <i class="fas fa-download"></i> 导出
                    </button>
                    <button class="action-btn delete" onclick="uiManager.deleteTable('${table.id}')">
                        <i class="fas fa-trash"></i> 删除
                    </button>
                </div>
            `;
            container.appendChild(card);
        });
    }

    // 更新处理面板
    updateProcessPanel() {
        const select = document.getElementById('processTableSelect');
        if (!select) return;
        
        select.innerHTML = '<option value="">请选择要处理的数据表</option>';
        
        const tables = dataStorage.getAllTables();
        tables.forEach(table => {
            const option = document.createElement('option');
            option.value = table.id;
            option.textContent = `${table.name} (${table.data.length}行)`;
            select.appendChild(option);
        });
    }

    // 更新汇总面板
    updateMergePanel() {
        const select = document.getElementById('summaryTableSelect');
        if (!select) return;
        
        select.innerHTML = '<option value="">请选择已处理的数据表</option>';
        
        const tables = dataStorage.getAllTables();
        tables.forEach(table => {
            if (table.metadata.processed) {
                const option = document.createElement('option');
                option.value = table.id;
                option.textContent = `${table.name} (已处理)`;
                select.appendChild(option);
            }
        });
    }

    // 预览表格
    previewTable(tableId) {
        const table = dataStorage.getTable(tableId);
        if (!table) return;
        
        this.showModal('数据预览 - ' + table.name, this.generatePreviewHTML(table));
    }

    // 生成预览HTML
    generatePreviewHTML(table) {
        const maxRows = Math.min(50, table.data.length);
        let html = `
            <div style="margin-bottom: 20px; color: #666;">
                <p><strong>表格信息：</strong> ${table.data.length}行 × ${table.columns.length}列</p>
                <p><strong>创建时间：</strong> ${new Date(table.metadata.created).toLocaleString()}</p>
            </div>
            <div style="overflow-x: auto;">
                <table class="data-preview">
                    <thead>
                        <tr>
        `;
        
        // 表头
        table.columns.forEach(col => {
            html += `<th>${col}</th>`;
        });
        
        html += `</tr></thead><tbody>`;
        
        // 数据行
        for (let i = 0; i < maxRows; i++) {
            const row = table.data[i];
            html += '<tr>';
            
            table.columns.forEach(col => {
                const value = row[col];
                html += `<td title="${value}">${this.truncateText(String(value || ''), 50)}</td>`;
            });
            
            html += '</tr>';
        }
        
        html += `</tbody></table>`;
        
        if (table.data.length > maxRows) {
            html += `<p style="margin-top: 15px; color: #999; text-align: center;">
                仅显示前${maxRows}行，共${table.data.length}行数据
            </p>`;
        }
        
        return html;
    }

    // 导出表格
    exportTable(tableId) {
        const table = dataStorage.getTable(tableId);
        if (!table) {
            this.showStatus('表格不存在', 'error');
            return;
        }
        
        try {
            // 创建工作表
            const ws = XLSX.utils.json_to_sheet(table.data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
            
            // 导出文件
            const fileName = `${table.name.replace(/[\\/:*?"<>|]/g, '_')}_导出.xlsx`;
            XLSX.writeFile(wb, fileName);
            
            this.showStatus('表格导出成功', 'success');
        } catch (error) {
            console.error('导出失败:', error);
            this.showStatus('导出失败: ' + error.message, 'error');
        }
    }

    // 删除表格
    deleteTable(tableId) {
        if (confirm('确定要删除这个表格吗？')) {
            const success = dataStorage.deleteTable(tableId);
            if (success) {
                this.showStatus('表格已删除', 'success');
                this.updateAllPanels();
            } else {
                this.showStatus('删除失败', 'error');
            }
        }
    }

    // 清空所有表格
    clearAllTables() {
        const tables = dataStorage.getAllTables();
        if (tables.length === 0) {
            this.showStatus('没有可清空的表格', 'info');
            return;
        }
        
        if (confirm(`确定要清空所有 ${tables.length} 个表格吗？此操作不可恢复。`)) {
            dataStorage.clearAllTables();
            this.showStatus('所有表格已清空', 'success');
            this.updateAllPanels();
        }
    }

    // 处理文件选择
    async handleFileSelect(event) {
        const files = Array.from(event.target.files);
        if (files.length === 0) return;
        
        // 显示文件信息
        this.showFileInfo(files);
        
        // 处理文件
        this.showLoader('正在上传和处理文件...');
        
        try {
            const results = await fileProcessor.processFiles(files);
            
            // 保存到数据存储
            results.forEach(result => {
                if (result.success && result.tables) {
                    result.tables.forEach(table => {
                        dataStorage.saveTable(
                            table.name,
                            table.data,
                            table.columns,
                            {
                                fileName: result.fileName,
                                sheetName: table.sheetName,
                                uploadTime: new Date().toISOString()
                            }
                        );
                    });
                }
            });
            
            // 更新UI
            this.updateAllPanels();
            this.hideLoader();
            this.showStatus(`成功上传 ${files.length} 个文件`, 'success');
            
            // 自动切换到表格管理面板
            this.showPanel('tables');
            
        } catch (error) {
            this.hideLoader();
            this.showStatus('文件处理失败: ' + error.message, 'error');
            console.error('文件处理错误:', error);
        }
        
        // 清空文件输入
        event.target.value = '';
    }

    // 显示文件信息
    showFileInfo(files) {
        const fileInfo = document.getElementById('fileInfo');
        const fileList = document.getElementById('fileList');
        
        if (!fileInfo || !fileList) return;
        
        fileList.innerHTML = '';
        files.forEach(file => {
            fileList.innerHTML += `
                <div style="background: white; padding: 10px; margin: 5px 0; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
                    <span><i class="fas fa-file"></i> ${file.name}</span>
                    <span style="color: #666; font-size: 0.9rem;">
                        ${(file.size / 1024).toFixed(1)} KB
                    </span>
                </div>
            `;
        });
        fileInfo.style.display = 'block';
    }

    // 初始化文件拖放
    initFileDrop() {
        const dropArea = document.getElementById('uploadDropArea');
        if (!dropArea) return;
        
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, preventDefaults, false);
        });
        
        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        ['dragenter', 'dragover'].forEach(eventName => {
            dropArea.addEventListener(eventName, highlight, false);
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, unhighlight, false);
        });
        
        function highlight() {
            dropArea.style.borderColor = '#2980b9';
            dropArea.style.background = '#f0f7ff';
        }
        
        function unhighlight() {
            dropArea.style.borderColor = '#3498db';
            dropArea.style.background = 'white';
        }
        
        dropArea.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = Array.from(dt.files);
            
            if (files.length > 0) {
                // 触发文件处理
                this.handleFileDrop(files);
            }
        });
    }

    // 处理文件拖放
    async handleFileDrop(files) {
        // 显示文件信息
        this.showFileInfo(files);
        
        // 处理文件
        this.showLoader('正在上传和处理文件...');
        
        try {
            const results = await fileProcessor.processFiles(files);
            
            // 保存到数据存储
            results.forEach(result => {
                if (result.success && result.tables) {
                    result.tables.forEach(table => {
                        dataStorage.saveTable(
                            table.name,
                            table.data,
                            table.columns,
                            {
                                fileName: result.fileName,
                                sheetName: table.sheetName,
                                uploadTime: new Date().toISOString(),
                                viaDragDrop: true
                            }
                        );
                    });
                }
            });
            
            // 更新UI
            this.updateAllPanels();
            this.hideLoader();
            this.showStatus(`成功拖放上传 ${files.length} 个文件`, 'success');
            
            // 自动切换到表格管理面板
            this.showPanel('tables');
            
        } catch (error) {
            this.hideLoader();
            this.showStatus('文件处理失败: ' + error.message, 'error');
            console.error('文件处理错误:', error);
        }
    }

    // 处理面板事件绑定
    bindProcessPanelEvents() {
        const processBtn = document.querySelector('button[onclick*="processSelectedTable"]');
        if (processBtn) {
            processBtn.onclick = this.processSelectedTable.bind(this);
        }
        
        const summaryBtn = document.querySelector('button[onclick*="generateSummary"]');
        if (summaryBtn) {
            summaryBtn.onclick = this.generateSummary.bind(this);
        }
    }

    // 处理选中的表格
    async processSelectedTable() {
        const select = document.getElementById('processTableSelect');
        const tableId = select.value;
        
        if (!tableId) {
            this.showStatus('请先选择要处理的表格', 'error');
            return;
        }
        
        const table = dataStorage.getTable(tableId);
        if (!table) {
            this.showStatus('表格不存在', 'error');
            return;
        }
        
        this.showLoader('正在处理表格...');
        
        try {
            // 模拟处理过程
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // 标记为已处理
            dataStorage.addTableMetadata(tableId, 'processed', true);
            dataStorage.addTableMetadata(tableId, 'processedTime', new Date().toISOString());
            
            this.hideLoader();
            this.showStatus('表格处理完成', 'success');
            this.updateAllPanels();
            
        } catch (error) {
            this.hideLoader();
            this.showStatus('处理失败: ' + error.message, 'error');
        }
    }

    // 生成汇总报表
    async generateSummary() {
        const select = document.getElementById('summaryTableSelect');
        const tableId = select.value;
        
        if (!tableId) {
            this.showStatus('请先选择要汇总的表格', 'error');
            return;
        }
        
        const table = dataStorage.getTable(tableId);
        if (!table) {
            this.showStatus('表格不存在', 'error');
            return;
        }
        
        this.showLoader('正在生成汇总报表...');
        
        try {
            // 模拟汇总处理
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const html = this.generateSummaryHTML(table);
            this.showModal('汇总报表 - ' + table.name, html);
            
            this.hideLoader();
            this.showStatus('汇总报表生成完成', 'success');
            
        } catch (error) {
            this.hideLoader();
            this.showStatus('汇总失败: ' + error.message, 'error');
        }
    }

    // 生成汇总HTML
    generateSummaryHTML(table) {
        const stats = {
            totalRows: table.data.length,
            totalColumns: table.columns.length,
            numericColumns: 0,
            textColumns: 0,
            dateColumns: 0
        };
        
        // 分析数据
        if (table.data.length > 0) {
            const firstRow = table.data[0];
            table.columns.forEach(col => {
                const value = firstRow[col];
                if (typeof value === 'number') {
                    stats.numericColumns++;
                } else if (value instanceof Date || (typeof value === 'string' && !isNaN(Date.parse(value)))) {
                    stats.dateColumns++;
                } else {
                    stats.textColumns++;
                }
            });
        }
        
        return `
            <div style="margin-bottom: 20px;">
                <h4 style="color: #2c3e50; margin-bottom: 15px;">表格统计信息</h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px;">
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; text-align: center;">
                        <p style="color: #666; margin: 0; font-size: 0.9rem;">总行数</p>
                        <p style="font-size: 1.5rem; font-weight: bold; color: #3498db; margin: 5px 0 0 0;">${stats.totalRows}</p>
                    </div>
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; text-align: center;">
                        <p style="color: #666; margin: 0; font-size: 0.9rem;">总列数</p>
                        <p style="font-size: 1.5rem; font-weight: bold; color: #27ae60; margin: 5px 0 0 0;">${stats.totalColumns}</p>
                    </div>
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; text-align: center;">
                        <p style="color: #666; margin: 0; font-size: 0.9rem;">数字列</p>
                        <p style="font-size: 1.5rem; font-weight: bold; color: #9b59b6; margin: 5px 0 0 0;">${stats.numericColumns}</p>
                    </div>
                </div>
            </div>
            
            <div>
                <h4 style="color: #2c3e50; margin-bottom: 15px;">数据列信息</h4>
                <table class="data-preview">
                    <thead>
                        <tr>
                            <th>列名</th>
                            <th>类型</th>
                            <th>示例值</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${table.columns.map(col => {
                            const sample = table.data[0]?.[col] || '';
                            let type = typeof sample;
                            if (sample instanceof Date || (typeof sample === 'string' && !isNaN(Date.parse(sample)))) {
                                type = '日期';
                            } else if (typeof sample === 'number') {
                                type = '数字';
                            } else {
                                type = '文本';
                            }
                            
                            return `
                                <tr>
                                    <td>${col}</td>
                                    <td>${type}</td>
                                    <td title="${sample}">${this.truncateText(String(sample), 30)}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    // 显示模态框
    showModal(title, content) {
        // 创建模态框HTML
        const modalHTML = `
            <div class="modal-overlay" id="dynamicModal" style="display: flex;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>${title}</h3>
                        <button onclick="uiManager.closeModal()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #999;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        ${content}
                    </div>
                </div>
            </div>
        `;
        
        // 移除旧的模态框
        const oldModal = document.getElementById('dynamicModal');
        if (oldModal) {
            oldModal.remove();
        }
        
        // 添加新的模态框
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    // 关闭模态框
    closeModal() {
        const modal = document.getElementById('dynamicModal');
        if (modal) {
            modal.remove();
        }
    }

    // 显示加载动画
    showLoader(message = '正在处理...') {
        const loader = document.getElementById('loader');
        const messageEl = document.getElementById('loaderMessage');
        
        if (loader) {
            loader.style.display = 'flex';
        }
        
        if (messageEl && message) {
            messageEl.textContent = message;
        }
    }

    // 隐藏加载动画
    hideLoader() {
        const loader = document.getElementById('loader');
        if (loader) {
            loader.style.display = 'none';
        }
    }

    // 显示状态消息
    showStatus(message, type = 'info', duration = 3000) {
        const statusEl = document.getElementById('statusMessage');
        if (!statusEl) return;
        
        statusEl.textContent = message;
        statusEl.className = 'status-message ' + type;
        statusEl.style.display = 'block';
        
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, duration);
    }

    // 截断文本
    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }
}

// 创建UI管理器实例
const uiManager = new UIManager();
window.uiManager = uiManager;

// 全局函数 - 用于HTML中的onclick事件
function showPanel(panelId) {
    uiManager.showPanel(panelId);
}
