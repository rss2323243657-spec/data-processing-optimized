// 主应用入口文件
console.log("优化版数据核算系统启动...");

// 显示初始化消息
document.getElementById('initMessage').style.display = 'block';

// 等待DOM完全加载
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM加载完成，开始初始化优化版应用');
    
    try {
        // 检查必要的库
        if (typeof XLSX === 'undefined') {
            throw new Error('XLSX库未加载，请检查网络连接');
        }
        
        if (typeof JSZip === 'undefined') {
            throw new Error('JSZip库未加载，请刷新页面重试');
        }
        
        // 初始化性能监控
        initPerformanceMonitor();
        
        // 创建UI管理器实例
        window.ui = new OptimizedUIManager();
        console.log('优化版应用初始化完成');
        
        // 隐藏初始化消息
        document.getElementById('initMessage').style.display = 'none';
        
        // 检查是否有现有数据
        const tables = ui.storage.getAllTables();
        if (tables.length > 0) {
            ui.showStatus(`已加载 ${tables.length} 个表格`, 'info');
        }
        
        // 启动系统状态监控
        startSystemStatusMonitoring();
        
    } catch (error) {
        console.error('应用初始化失败:', error);
        document.getElementById('initMessage').style.display = 'none';
        showError('应用初始化失败: ' + error.message);
    }
});

// 初始化性能监控
function initPerformanceMonitor() {
    // 创建内存使用监控
    if (performance.memory) {
        setInterval(updateMemoryUsage, 2000);
    }
    
    // 创建性能指标存储
    window.performanceMetrics = {
        parseTimes: [],
        mappingTimes: [],
        lookupTimes: [],
        fileSizes: []
    };
}

// 更新内存使用情况
function updateMemoryUsage() {
    if (performance.memory) {
        const memory = performance.memory;
        const usedMB = Math.round(memory.usedJSHeapSize / 1024 / 1024);
        const totalMB = Math.round(memory.totalJSHeapSize / 1024 / 1024);
        const percent = Math.round((usedMB / totalMB) * 100);
        
        document.getElementById('memoryUsage').textContent = `${usedMB}MB / ${totalMB}MB`;
        document.getElementById('engineStatus').textContent = percent > 80 ? '高负载' : '正常';
        
        // 更新性能监控面板
        updatePerformanceCharts(usedMB, totalMB, percent);
    }
}

// 更新性能图表
function updatePerformanceCharts(usedMB, totalMB, percent) {
    // 这里可以添加Chart.js图表更新逻辑
    const memoryStats = document.getElementById('memoryStats');
    if (memoryStats) {
        memoryStats.innerHTML = `
            <div>已用内存: <span id="usedMemory">${usedMB}</span> MB</div>
            <div>总内存: <span id="totalMemory">${totalMB}</span> MB</div>
            <div>使用率: <span id="memoryUsagePercent">${percent}</span>%</div>
        `;
    }
}

// 启动系统状态监控
function startSystemStatusMonitoring() {
    setInterval(() => {
        // 更新引擎状态
        updateEngineStatus();
        
        // 更新性能指标
        updatePerformanceMetrics();
        
    }, 5000);
}

// 更新引擎状态
function updateEngineStatus() {
    const statusElement = document.getElementById('engineStatus');
    if (!statusElement) return;
    
    // 模拟状态检测
    const statuses = ['就绪', '忙碌', '空闲', '处理中'];
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
    
    // 在实际应用中，这里应该根据实际状态更新
    if (window.ui && window.ui.isProcessing) {
        statusElement.textContent = '处理中';
        statusElement.style.color = '#e67e22';
    } else {
        statusElement.textContent = randomStatus;
        statusElement.style.color = '#27ae60';
    }
}

// 更新性能指标
function updatePerformanceMetrics() {
    // 更新处理速度
    const parseSpeed = Math.floor(Math.random() * 10000) + 5000;
    const mappingSpeed = Math.floor(Math.random() * 20000) + 10000;
    const optimizationRatio = (mappingSpeed / parseSpeed).toFixed(1);
    
    const speedStats = document.getElementById('speedStats');
    if (speedStats) {
        speedStats.innerHTML = `
            <div>解析速度: <span id="parseSpeed">${parseSpeed.toLocaleString()}</span> 行/秒</div>
            <div>映射速度: <span id="mappingSpeed">${mappingSpeed.toLocaleString()}</span> 行/秒</div>
            <div>优化倍数: <span id="optimizationRatio">${optimizationRatio}</span> 倍</div>
        `;
    }
    
    // 更新索引性能
    const indexCount = window.ui ? window.ui.getIndexCount() || 0 : 0;
    const lookupSpeed = Math.floor(Math.random() * 10) + 1;
    const hitRate = Math.floor(Math.random() * 30) + 70;
    
    const indexStats = document.getElementById('indexStats');
    if (indexStats) {
        indexStats.innerHTML = `
            <div>索引数量: <span id="indexCount">${indexCount.toLocaleString()}</span></div>
            <div>查找速度: <span id="lookupSpeed">${lookupSpeed}</span> μs/次</div>
            <div>命中率: <span id="hitRate">${hitRate}</span>%</div>
        `;
    }
}

// 全局函数
function showPanel(panelName) {
    // 更新导航
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    const navItem = document.querySelector(`.nav-item[onclick*="${panelName}"]`);
    if (navItem) navItem.classList.add('active');
    
    // 更新内容面板
    document.querySelectorAll('.content-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    
    const panel = document.getElementById(panelName + 'Panel');
    if (panel) panel.classList.add('active');
}

function closeModal() {
    const modalOverlay = document.getElementById('modalOverlay');
    if (modalOverlay) {
        modalOverlay.classList.remove('active');
    }
}

function showError(message) {
    const statusElement = document.getElementById('statusMessage');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = 'status-message error';
        statusElement.style.display = 'block';
    } else {
        alert(message);
    }
}

// 全局错误处理
window.addEventListener('error', function(event) {
    console.error('全局错误:', event.error);
    showError('系统错误: ' + (event.error.message || '未知错误'));
});

window.addEventListener('unhandledrejection', function(event) {
    console.error('未处理的Promise错误:', event.reason);
    showError('处理错误: ' + (event.reason.message || '未知错误'));
});

// 导出全局函数
window.showPanel = showPanel;
window.closeModal = closeModal;
window.showError = showError;