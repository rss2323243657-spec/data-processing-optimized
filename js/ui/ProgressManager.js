// 进度管理器
class ProgressManager {
    constructor() {
        this.progressData = new Map();
        this.listeners = new Map();
        this.workerProgress = new Map();
        
        this.init();
    }
    
    init() {
        console.log('进度管理器初始化');
    }
    
    // 开始一个进度任务
    startTask(taskId, taskName, total = 100) {
        const task = {
            id: taskId,
            name: taskName,
            total,
            current: 0,
            startTime: Date.now(),
            status: 'running',
            details: {},
            subTasks: new Map()
        };
        
        this.progressData.set(taskId, task);
        this.notifyListeners('taskStarted', task);
        
        return taskId;
    }
    
    // 更新任务进度
    updateProgress(taskId, current, details = {}) {
        const task = this.progressData.get(taskId);
        if (!task) return;
        
        task.current = Math.min(current, task.total);
        task.details = { ...task.details, ...details };
        task.lastUpdate = Date.now();
        
        // 计算进度百分比
        const percent = Math.round((task.current / task.total) * 100);
        
        // 计算估计剩余时间
        if (task.current > 0) {
            const elapsed = Date.now() - task.startTime;
            const estimatedTotal = (elapsed / task.current) * task.total;
            task.estimatedRemaining = Math.round((estimatedTotal - elapsed) / 1000); // 秒
        }
        
        this.notifyListeners('progressUpdated', task);
        
        return percent;
    }
    
    // 更新子任务进度
    updateSubTask(taskId, subTaskId, subTaskName, current, total) {
        const task = this.progressData.get(taskId);
        if (!task) return;
        
        let subTask = task.subTasks.get(subTaskId);
        if (!subTask) {
            subTask = {
                id: subTaskId,
                name: subTaskName,
                total,
                current: 0,
                startTime: Date.now()
            };
            task.subTasks.set(subTaskId, subTask);
        }
        
        subTask.current = current;
        subTask.percent = Math.round((current / total) * 100);
        
        // 更新主任务进度（基于子任务）
        this.updateTaskFromSubTasks(taskId);
        
        this.notifyListeners('subTaskUpdated', { taskId, subTask });
    }
    
    // 基于子任务更新主任务进度
    updateTaskFromSubTasks(taskId) {
        const task = this.progressData.get(taskId);
        if (!task || task.subTasks.size === 0) return;
        
        let totalProgress = 0;
        let totalWeight = 0;
        
        task.subTasks.forEach(subTask => {
            const weight = subTask.total || 1;
            totalProgress += (subTask.current / subTask.total) * weight;
            totalWeight += weight;
        });
        
        if (totalWeight > 0) {
            const overallPercent = Math.round((totalProgress / totalWeight) * 100);
            this.updateProgress(taskId, overallPercent, {
                subTaskCount: task.subTasks.size
            });
        }
    }
    
    // 更新Web Worker进度
    updateWorkerProgress(workerId, progress) {
        this.workerProgress.set(workerId, {
            ...progress,
            lastUpdate: Date.now()
        });
        
        this.notifyListeners('workerProgress', { workerId, progress });
    }
    
    // 完成任务
    completeTask(taskId, result = {}) {
        const task = this.progressData.get(taskId);
        if (!task) return;
        
        task.status = 'completed';
        task.endTime = Date.now();
        task.duration = task.endTime - task.startTime;
        task.result = result;
        task.current = task.total;
        
        this.notifyListeners('taskCompleted', task);
        
        // 延迟清理完成的任务
        setTimeout(() => {
            this.progressData.delete(taskId);
        }, 5000);
    }
    
    // 任务失败
    failTask(taskId, error) {
        const task = this.progressData.get(taskId);
        if (!task) return;
        
        task.status = 'failed';
        task.endTime = Date.now();
        task.duration = task.endTime - task.startTime;
        task.error = error;
        
        this.notifyListeners('taskFailed', task);
        
        // 延迟清理失败的任务
        setTimeout(() => {
            this.progressData.delete(taskId);
        }, 10000);
    }
    
    // 获取任务进度
    getTaskProgress(taskId) {
        const task = this.progressData.get(taskId);
        if (!task) return null;
        
        const percent = Math.round((task.current / task.total) * 100);
        
        return {
            id: task.id,
            name: task.name,
            percent,
            current: task.current,
            total: task.total,
            status: task.status,
            details: task.details,
            estimatedRemaining: task.estimatedRemaining,
            duration: task.duration || Date.now() - task.startTime
        };
    }
    
    // 获取所有任务进度
    getAllProgress() {
        const progress = {};
        
        this.progressData.forEach((task, taskId) => {
            progress[taskId] = this.getTaskProgress(taskId);
        });
        
        return {
            tasks: progress,
            workerProgress: Array.from(this.workerProgress.entries()),
            totalTasks: this.progressData.size,
            activeTasks: Array.from(this.progressData.values()).filter(t => t.status === 'running').length
        };
    }
    
    // 注册进度监听器
    addListener(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }
    
    // 移除进度监听器
    removeListener(event, callback) {
        if (!this.listeners.has(event)) return;
        
        const callbacks = this.listeners.get(event);
        const index = callbacks.indexOf(callback);
        if (index > -1) {
            callbacks.splice(index, 1);
        }
    }
    
    // 通知监听器
    notifyListeners(event, data) {
        if (!this.listeners.has(event)) return;
        
        this.listeners.get(event).forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error('进度监听器错误:', error);
            }
        });
    }
    
    // 创建进度UI
    createProgressUI(taskId, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const task = this.progressData.get(taskId);
        if (!task) return;
        
        const progressElement = document.createElement('div');
        progressElement.className = 'progress-container';
        progressElement.id = `progress_${taskId}`;
        
        progressElement.innerHTML = `
            <div class="progress-header">
                <div class="progress-title">
                    <i class="fas fa-spinner fa-spin"></i>
                    <span>${task.name}</span>
                </div>
                <div class="progress-percent">0%</div>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: 0%"></div>
            </div>
            <div class="progress-details">
                <div class="progress-stats">
                    <span class="progress-current">0</span>
                    <span> / </span>
                    <span class="progress-total">${task.total}</span>
                </div>
                <div class="progress-eta" style="display: none;">
                    <i class="fas fa-clock"></i>
                    <span>剩余: <span class="eta-value">--</span>秒</span>
                </div>
            </div>
            <div class="progress-subtasks" style="display: none;"></div>
        `;
        
        container.appendChild(progressElement);
        
        // 监听进度更新
        this.addListener('progressUpdated', (updatedTask) => {
            if (updatedTask.id === taskId) {
                this.updateProgressUI(taskId);
            }
        });
        
        this.addListener('subTaskUpdated', ({ taskId: updatedTaskId, subTask }) => {
            if (updatedTaskId === taskId) {
                this.updateSubTaskUI(taskId, subTask);
            }
        });
        
        this.addListener('taskCompleted', (completedTask) => {
            if (completedTask.id === taskId) {
                this.completeProgressUI(taskId);
            }
        });
        
        this.addListener('taskFailed', (failedTask) => {
            if (failedTask.id === taskId) {
                this.failProgressUI(taskId, failedTask.error);
            }
        });
    }
    
    // 更新进度UI
    updateProgressUI(taskId) {
        const progress = this.getTaskProgress(taskId);
        if (!progress) return;
        
        const element = document.getElementById(`progress_${taskId}`);
        if (!element) return;
        
        const percentElement = element.querySelector('.progress-percent');
        const fillElement = element.querySelector('.progress-fill');
        const currentElement = element.querySelector('.progress-current');
        const etaElement = element.querySelector('.progress-eta');
        const etaValueElement = element.querySelector('.eta-value');
        
        if (percentElement) {
            percentElement.textContent = `${progress.percent}%`;
        }
        
        if (fillElement) {
            fillElement.style.width = `${progress.percent}%`;
        }
        
        if (currentElement) {
            currentElement.textContent = progress.current;
        }
        
        if (progress.estimatedRemaining && progress.estimatedRemaining > 0) {
            if (etaElement) etaElement.style.display = 'block';
            if (etaValueElement) etaValueElement.textContent = progress.estimatedRemaining;
        }
        
        // 更新子任务显示
        this.updateSubTasksUI(taskId);
    }
    
    // 更新子任务UI
    updateSubTasksUI(taskId) {
        const task = this.progressData.get(taskId);
        if (!task || task.subTasks.size === 0) return;
        
        const element = document.getElementById(`progress_${taskId}`);
        if (!element) return;
        
        const subtasksContainer = element.querySelector('.progress-subtasks');
        if (!subtasksContainer) return;
        
        subtasksContainer.style.display = 'block';
        
        let html = '<div class="subtasks-header">子任务:</div>';
        
        task.subTasks.forEach(subTask => {
            const percent = Math.round((subTask.current / subTask.total) * 100);
            html += `
                <div class="subtask">
                    <div class="subtask-name">${subTask.name}</div>
                    <div class="subtask-progress">
                        <div class="subtask-bar">
                            <div class="subtask-fill" style="width: ${percent}%"></div>
                        </div>
                        <div class="subtask-percent">${percent}%</div>
                    </div>
                </div>
            `;
        });
        
        subtasksContainer.innerHTML = html;
    }
    
    updateSubTaskUI(taskId, subTask) {
        this.updateSubTasksUI(taskId);
    }
    
    // 完成进度UI
    completeProgressUI(taskId) {
        const element = document.getElementById(`progress_${taskId}`);
        if (!element) return;
        
        element.classList.add('completed');
        
        const header = element.querySelector('.progress-header');
        if (header) {
            const icon = header.querySelector('i');
            if (icon) {
                icon.className = 'fas fa-check-circle';
                icon.style.color = '#27ae60';
            }
        }
        
        // 添加完成动画
        element.style.opacity = '0.8';
        
        // 延迟移除
        setTimeout(() => {
            if (element.parentNode) {
                element.parentNode.removeChild(element);
            }
        }, 2000);
    }
    
    // 失败进度UI
    failProgressUI(taskId, error) {
        const element = document.getElementById(`progress_${taskId}`);
        if (!element) return;
        
        element.classList.add('failed');
        
        const header = element.querySelector('.progress-header');
        if (header) {
            const icon = header.querySelector('i');
            if (icon) {
                icon.className = 'fas fa-times-circle';
                icon.style.color = '#e74c3c';
            }
        }
        
        // 显示错误信息
        const errorElement = document.createElement('div');
        errorElement.className = 'progress-error';
        errorElement.innerHTML = `
            <i class="fas fa-exclamation-triangle"></i>
            <span>${error.message || '处理失败'}</span>
        `;
        
        element.appendChild(errorElement);
    }
    
    // 创建Web Worker进度监控
    monitorWorkerProgress(workerId, worker) {
        worker.onmessage = (e) => {
            if (e.data.progress) {
                this.updateWorkerProgress(workerId, e.data.progress);
            }
        };
        
        worker.onerror = (error) => {
            this.updateWorkerProgress(workerId, {
                status: 'error',
                error: error.message
            });
        };
    }
    
    // 获取系统整体进度
    getSystemProgress() {
        const allProgress = this.getAllProgress();
        let totalPercent = 0;
        let activeCount = 0;
        
        Object.values(allProgress.tasks).forEach(task => {
            if (task.status === 'running') {
                totalPercent += task.percent;
                activeCount++;
            }
        });
        
        const avgPercent = activeCount > 0 ? Math.round(totalPercent / activeCount) : 0;
        
        return {
            overallProgress: avgPercent,
            activeTasks: activeCount,
            totalTasks: allProgress.totalTasks,
            workerStatus: allProgress.workerProgress.map(([id, status]) => ({
                id,
                status: status.status || 'running',
                lastUpdate: status.lastUpdate
            }))
        };
    }
    
    // 清理旧数据
    cleanupOldData(maxAge = 300000) { // 5分钟
        const now = Date.now();
        const toDelete = [];
        
        this.progressData.forEach((task, taskId) => {
            if (task.status !== 'running' && now - (task.endTime || now) > maxAge) {
                toDelete.push(taskId);
            }
        });
        
        toDelete.forEach(taskId => {
            this.progressData.delete(taskId);
        });
        
        // 清理旧的worker进度
        this.workerProgress.forEach((progress, workerId) => {
            if (now - progress.lastUpdate > maxAge) {
                this.workerProgress.delete(workerId);
            }
        });
        
        return toDelete.length;
    }
    
    // 导出进度数据
    exportProgressData() {
        return {
            timestamp: Date.now(),
            tasks: Array.from(this.progressData.values()).map(task => ({
                id: task.id,
                name: task.name,
                status: task.status,
                progress: Math.round((task.current / task.total) * 100),
                startTime: task.startTime,
                duration: task.duration,
                details: task.details
            })),
            workerProgress: Array.from(this.workerProgress.entries()),
            systemProgress: this.getSystemProgress()
        };
    }
}