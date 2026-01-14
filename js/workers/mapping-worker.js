// 映射处理Web Worker
self.onmessage = function(e) {
    const { type, batch, rules } = e.data;
    
    switch(type) {
        case 'processBatch':
            // 处理一批字段映射
            const processed = processMappingBatch(batch, rules);
            self.postMessage(processed);
            break;
            
        case 'compileRules':
            // 编译映射规则
            const compiledRules = compileMappingRules(rules);
            self.postMessage({ type: 'rulesCompiled', rules: compiledRules });
            break;
            
        case 'batchApply':
            // 批量应用映射
            const result = batchApplyMappings(batch);
            self.postMessage({ type: 'batchApplied', result });
            break;
            
        case 'incrementalUpdate':
            // 增量更新映射
            const updated = incrementalUpdateMappings(batch);
            self.postMessage({ type: 'updated', mappings: updated });
            break;
    }
};

// 处理映射批次
function processMappingBatch(batch, rules) {
    const startTime = performance.now();
    const processedMappings = {};
    
    batch.forEach(item => {
        const { transactionDesc, amountType, key } = item;
        
        // 应用映射规则
        const mapping = applyMappingRules(transactionDesc, amountType, rules);
        
        if (mapping) {
            processedMappings[key] = {
                primaryCategory: mapping.category,
                subcategoryName: mapping.subcategoryName || transactionDesc,
                transactionDesc,
                amountType,
                matchedBy: mapping.rule || '智能匹配',
                confidence: mapping.confidence || 1.0
            };
        }
    });
    
    const processingTime = performance.now() - startTime;
    
    return {
        mappings: processedMappings,
        batchSize: batch.length,
        processingTime,
        processedCount: Object.keys(processedMappings).length
    };
}

// 应用映射规则
function applyMappingRules(transactionDesc, amountType, rules) {
    if (!transactionDesc) return null;
    
    const descLower = transactionDesc.toLowerCase();
    const amountTypeLower = amountType ? amountType.toLowerCase() : '';
    
    // 1. 检查精确匹配规则
    if (rules.exactMatches) {
        const exactKey = `${descLower}|${amountTypeLower}`;
        if (rules.exactMatches[exactKey]) {
            return {
                category: rules.exactMatches[exactKey],
                rule: '精确匹配',
                confidence: 1.0
            };
        }
    }
    
    // 2. 检查模式匹配规则
    if (rules.patterns) {
        for (const pattern of rules.patterns) {
            if (pattern.regex.test(descLower) || 
                (amountTypeLower && pattern.regex.test(amountTypeLower))) {
                return {
                    category: pattern.category,
                    rule: pattern.name,
                    confidence: pattern.confidence || 0.9
                };
            }
        }
    }
    
    // 3. 检查关键词匹配
    if (rules.keywords) {
        let bestMatch = null;
        let maxScore = 0;
        
        for (const [category, keywords] of Object.entries(rules.keywords)) {
            let score = 0;
            
            // 检查描述中的关键词
            keywords.forEach(keyword => {
                if (descLower.includes(keyword.toLowerCase())) {
                    score += 2; // 描述中匹配关键词得分更高
                }
            });
            
            // 检查Amount Type中的关键词
            if (amountTypeLower) {
                keywords.forEach(keyword => {
                    if (amountTypeLower.includes(keyword.toLowerCase())) {
                        score += 1;
                    }
                });
            }
            
            if (score > maxScore) {
                maxScore = score;
                bestMatch = category;
            }
        }
        
        if (bestMatch && maxScore > 0) {
            return {
                category: bestMatch,
                rule: '关键词匹配',
                confidence: Math.min(0.7 + (maxScore * 0.05), 0.9)
            };
        }
    }
    
    // 4. 默认规则
    if (rules.defaultCategory) {
        return {
            category: rules.defaultCategory,
            rule: '默认规则',
            confidence: 0.5
        };
    }
    
    return null;
}

// 编译映射规则
function compileMappingRules(rulesConfig) {
    const compiledRules = {
        exactMatches: {},
        patterns: [],
        keywords: {},
        defaultCategory: '__ignore__'
    };
    
    // 编译精确匹配规则
    if (rulesConfig.exactMatches) {
        rulesConfig.exactMatches.forEach(match => {
            const key = `${match.desc.toLowerCase()}|${match.type.toLowerCase()}`;
            compiledRules.exactMatches[key] = match.category;
        });
    }
    
    // 编译模式匹配规则
    if (rulesConfig.patterns) {
        rulesConfig.patterns.forEach(pattern => {
            compiledRules.patterns.push({
                name: pattern.name,
                regex: new RegExp(pattern.pattern, 'i'),
                category: pattern.category,
                confidence: pattern.confidence || 0.8
            });
        });
    }
    
    // 编译关键词规则
    if (rulesConfig.keywords) {
        compiledRules.keywords = { ...rulesConfig.keywords };
    }
    
    // 设置默认分类
    if (rulesConfig.defaultCategory) {
        compiledRules.defaultCategory = rulesConfig.defaultCategory;
    }
    
    return compiledRules;
}

// 批量应用映射
function batchApplyMappings(data) {
    const startTime = performance.now();
    const results = [];
    let appliedCount = 0;
    let skippedCount = 0;
    
    data.forEach(item => {
        // 这里可以添加批量应用的逻辑
        // 例如：批量更新分类、批量修改子分类名称等
        if (item.needsProcessing) {
            results.push({
                ...item,
                processed: true,
                processedAt: new Date().toISOString()
            });
            appliedCount++;
        } else {
            results.push(item);
            skippedCount++;
        }
    });
    
    const processingTime = performance.now() - startTime;
    
    return {
        results,
        appliedCount,
        skippedCount,
        processingTime,
        totalItems: data.length
    };
}

// 增量更新映射
function incrementalUpdateMappings(updates) {
    const updatedMappings = {};
    
    updates.forEach(update => {
        const { key, oldMapping, newMapping } = update;
        
        // 只更新有变化的映射
        if (JSON.stringify(oldMapping) !== JSON.stringify(newMapping)) {
            updatedMappings[key] = {
                ...newMapping,
                updatedAt: new Date().toISOString(),
                previousCategory: oldMapping.primaryCategory
            };
        }
    });
    
    return updatedMappings;
}

// 预定义的映射规则（可以作为默认配置）
const defaultRules = {
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
    keywords: {
        '销售额': ['sale', 'sales', '销售', '订单', 'revenue', 'income'],
        '广告费': ['ad', '广告', 'sponsored', 'promotion', 'cpc', 'ppc'],
        '平台佣金': ['commission', 'fee', '佣金', '平台费', 'service', 'amazon fee'],
        '仓储费用': ['storage', 'warehouse', '仓储', '库存', 'fba storage'],
        '产品成本': ['product', 'cost', '产品', '采购', 'inventory', 'material'],
        '退货费用': ['return', 'refund', '退货', '退款', 'reimbursement'],
        '测评费用': ['review', 'test', '测评', '评价', 'vine'],
        '物流费': ['shipping', 'logistics', '物流', '运费', 'delivery', 'transport']
    },
    defaultCategory: '__ignore__'
};

// 初始化时编译默认规则
const compiledDefaultRules = compileMappingRules(defaultRules);
self.postMessage({ type: 'initialized', rules: compiledDefaultRules });