// 数据核算系统主应用
class DataCalcApp {
    constructor() {
        this.isInitialized = false;
        this.modules = {
            storage: null,
            processor: null,
            ui: null
        };
    }

    // 初始化应用
    async init() {
        if (this.isInitialized) return;
        
        console.log('数据核算系统初始化开始...');
        
        try {
            // 显示初始化加载动画
            this.showInitLoader();
            
            // 初始化模块
            await this.initModules();
            
            // 绑定全局事件
            this.bindGlobalEvents();
            
            // 检查存储的数据
            this.checkStoredData();
            
            // 隐藏加载动画
            this.hideInitLoader();
            
            this.isInitialized = true;
            console.log('数据核算系统初始化完成');
            
            // 显示欢迎消息
            setTimeout(() => {
                uiManager.showStatus('系统已就绪，请上传数据文件', 'success');
            }, 500);
            
        } catch (error) {
            console.error('应用初始化失败:', error);
            this.showError('应用初始化失败: ' + error.message);
        }
    }

    // 显示初始化加载动画
    showInitLoader() {
        const loader = document.getElementById('loader');
        const message = document.getElementById('loaderMessage');
        
        if (loader) loader.style.display = 'flex';
        if (message) message.textContent = '正在初始化系统...';
    }

    // 隐藏初始化加载动画
    hideInitLoader() {
        const loader = document.getElementById('loader');
        if (loader) {
            setTimeout(() => {
                loader.style.display = 'none';
            }, 500);
        }
    }

    // 初始化模块
    async initModules() {
        // 确保依赖库已加载
        await this.waitForDependencies();
        
        // 初始化数据存储
        this.modules.storage = dataStorage;
        console.log('数据存储模块初始化完成');
        
        // 初始化文件处理器
        this.modules.processor = fileProcessor;
        console.log('文件处理模块初始化完成');
        
        // 初始化UI管理器
        this.modules.ui = uiManager;
        this.modules.ui.init();
        console.log('UI管理模块初始化完成');
    }

    // 等待依赖库加载
    waitForDependencies() {
        return new Promise((resolve) => {
            const checkDeps = () => {
                if (typeof XLSX !== 'undefined') {
                    resolve();
                } else {
                    setTimeout(checkDeps, 100);
                }
            };
            checkDeps();
        });
    }

    // 绑定全局事件
    bindGlobalEvents() {
        // 窗口大小变化
        window.addEventListener('resize', this.handleResize.bind(this));
        
        // 页面可见性变化
        document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
        
        // 阻止拖放默认行为
        document.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
        
        document.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
        
        // 键盘快捷键
        document.addEventListener('keydown', this.handleKeyboardShortcuts.bind(this));
    }

    // 窗口大小变化处理
    handleResize() {
        // 可以在这里添加响应式处理
        console.log('窗口大小变化:', window.innerWidth, 'x', window.innerHeight);
    }

    // 页面可见性变化
    handleVisibilityChange() {
        if (document.hidden) {
            console.log('页面隐藏，保存数据...');
            dataStorage.saveToStorage();
        } else {
            console.log('页面恢复显示');
        }
    }

    // 键盘快捷键
    handleKeyboardShortcuts(event) {
        // Ctrl+S: 保存
        if (event.ctrlKey && event.key === 's') {
            event.preventDefault();
            dataStorage.saveToStorage();
            uiManager.showStatus('数据已保存', 'success');
        }
        
        // Ctrl+U: 上传文件
        if (event.ctrlKey && event.key === 'u') {
            event.preventDefault();
            document.getElementById('fileInput').click();
        }
        
        // Esc: 关闭模态框
        if (event.key === 'Escape') {
            uiManager.closeModal();
        }
    }

    // 检查存储的数据
    checkStoredData() {
        const tables = dataStorage.getAllTables();
        if (tables.length > 0) {
            console.log(`从存储中恢复了 ${tables.length} 个表格`);
            
            // 显示恢复的数据信息
            const totalRows = tables.reduce((sum, table) => sum + table.data.length, 0);
            setTimeout(() => {
                uiManager.showStatus(`已恢复 ${tables.length} 个表格 (共 ${totalRows} 行数据)`, 'info');
            }, 1000);
        }
    }

    // 显示错误
    showError(message) {
        console.error('应用错误:', message);
        
        const errorHTML = `
            <div style="text-align: center; padding: 40px; color: #e74c3c;">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 20px;"></i>
                <h3>系统初始化失败</h3>
                <p style="margin: 15px 0;">${message}</p>
                <p style="color: #7f8c8d; font-size: 0.9rem;">
                    请刷新页面重试，或检查控制台查看详细错误信息
                </p>
                <button onclick="location.reload()" style="
                    background: #3498db;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 6px;
                    cursor: pointer;
                    margin-top: 20px;
                ">
                    <i class="fas fa-redo"></i> 刷新页面
                </button>
            </div>
        `;
        
        // 显示错误界面
        document.querySelector('.app-container').innerHTML = errorHTML;
    }

    // 获取应用状态
    getAppStatus() {
        return {
            initialized: this.isInitialized,
            tables: dataStorage.getAllTables().length,
            totalRows: dataStorage.getTableStats().totalRows,
            currentPanel: uiManager.currentPanel,
            storageSize: this.getStorageSize()
        };
    }

    // 获取存储大小
    getStorageSize() {
        try {
            const data = localStorage.getItem('dataCalcSystem');
            if (data) {
                return (data.length * 2) / 1024 / 1024; // MB
            }
        } catch (error) {
            console.error('获取存储大小失败:', error);
        }
        return 0;
    }

    // 重置应用
    resetApp() {
        if (confirm('确定要重置应用吗？所有数据将被清除。')) {
            localStorage.removeItem('dataCalcSystem');
            location.reload();
        }
    }

    // 导出所有数据
    exportAllData() {
        const tables = dataStorage.getAllTables();
        if (tables.length === 0) {
            uiManager.showStatus('没有数据可以导出', 'info');
            return;
        }
        
        // 创建包含所有工作表的Excel文件
        const wb = XLSX.utils.book_new();
        
        tables.forEach((table, index) => {
            const ws = XLSX.utils.json_to_sheet(table.data);
            const sheetName = table.name.substring(0, 31); // Excel工作表名称限制
            XLSX.utils.book_append_sheet(wb, ws, sheetName || `Sheet${index + 1}`);
        });
        
        XLSX.writeFile(wb, '数据核算系统_全部数据导出.xlsx');
        uiManager.showStatus('所有数据导出成功', 'success');
    }

    // 导入数据
    importData() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.xlsx,.xls,.csv,.json';
        
        input.onchange = async (event) => {
            const file = event.target.files[0];
            if (!file) return;
            
            uiManager.showLoader('正在导入数据...');
            
            try {
                if (file.name.endsWith('.json')) {
                    // 导入JSON数据
                    await this.importJSONData(file);
                } else {
                    // 导入Excel/CSV数据
                    const result = await fileProcessor.processFiles([file]);
                    if (result[0]?.success) {
                        result[0].tables.forEach(table => {
                            dataStorage.saveTable(
                                `导入_${table.name}`,
                                table.data,
                                table.columns,
                                {
                                    fileName: file.name,
                                    importTime: new Date().toISOString()
                                }
                            );
                        });
                    }
                }
                
                uiManager.updateAllPanels();
                uiManager.hideLoader();
                uiManager.showStatus('数据导入成功', 'success');
                
            } catch (error) {
                uiManager.hideLoader();
                uiManager.showStatus('导入失败: ' + error.message, 'error');
                console.error('导入错误:', error);
            }
        };
        
        input.click();
    }

    // 导入JSON数据
    async importJSONData(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    
                    if (Array.isArray(data)) {
                        // 如果是数组，假设每个元素是一个表格
                        data.forEach((tableData, index) => {
                            if (tableData.name && tableData.data && tableData.columns) {
                                dataStorage.saveTable(
                                    tableData.name,
                                    tableData.data,
                                    tableData.columns,
                                    {
                                        ...tableData.metadata,
                                        importTime: new Date().toISOString()
                                    }
                                );
                            }
                        });
                    } else if (data.name && data.data && data.columns) {
                        // 单个表格
                        dataStorage.saveTable(
                            data.name,
                            data.data,
                            data.columns,
                            {
                                ...data.metadata,
                                importTime: new Date().toISOString()
                            }
                        );
                    } else {
                        reject(new Error('JSON格式不正确'));
                    }
                    
                    resolve();
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }
}

// 创建应用实例并初始化
const dataCalcApp = new DataCalcApp();

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
    // 隐藏初始化消息
    const initMessage = document.getElementById('initMessage');
    if (initMessage) {
        initMessage.style.display = 'none';
    }
    
    // 初始化应用
    dataCalcApp.init();
});

// 暴露到全局
window.dataCalcApp = dataCalcApp;
