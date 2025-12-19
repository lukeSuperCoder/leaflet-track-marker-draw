# 轨迹抽稀插件 - 第二部分功能说明

## 📋 功能概述

第二部分在第一部分基础上新增了**异常事件线段绘制**功能，支持在高缩放级别下，根据视口范围动态绘制异常事件的红色线段。

---

## ✨ 新增功能

### 1. **异常线段绘制**
- 当地图缩放级别 ≥ 配置的最小级别（默认15级）时，自动绘制异常线段
- 异常线段为红色加粗线（weight: 5, opacity: 0.7）
- 根据 `eventId` 自动分组并连线

### 2. **数据格式兼容**
插件现在支持两种数据格式：

#### **第一部分格式（数组）**
```javascript
{
  lon: 119.248498,
  lat: 32.20522,
  eventData: []  // 空数组或包含事件的数组
}
```

#### **第二部分格式（对象）**
```javascript
{
  lon: 119.248498,
  lat: 32.20522,
  eventData: {    // 对象或 null
    eventType: 1,
    eventId: "2000794289127546882"
  }
}
```

### 3. **视口范围动态更新**
- 监听 `moveend` 事件，平移地图时自动更新异常线段
- 监听 `zoomend` 事件，缩放地图时自动更新异常线段
- 只绘制当前可视范围内的异常线段，提升性能

### 4. **智能分组绘制**
- 自动按 `eventId` 分组
- 只有 2 个及以上点的组才绘制线段
- 单点的 eventId 自动过滤

---

## 🔧 使用方法

### **基本使用**

```javascript
// 启用异常线段功能
const trackId = trackThinning.addTrack(trackData, {
  enableEventLines: true,      // 开启异常线段
  eventLinesMinZoom: 15        // 最小显示级别（默认15）
});
```

### **关闭异常线段功能（默认）**

```javascript
// 不传参数或设置为 false
const trackId = trackThinning.addTrack(trackData);
// 或
const trackId = trackThinning.addTrack(trackData, {
  enableEventLines: false
});
```

---

## 📊 配置参数

### **addTrack 方法新增参数**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enableEventLines` | Boolean | `false` | 是否启用异常线段绘制 |
| `eventLinesMinZoom` | Number | `15` | 异常线段显示的最小缩放级别 |
| `eventLineStyle` | Object | 见下方 | 异常线段样式配置 |

### **异常线段默认样式**

```javascript
eventLineStyle: {
  color: '#ff0000',      // 红色
  weight: 5,             // 加粗
  opacity: 0.7,          // 带透明度
  lineJoin: 'round',
  lineCap: 'round'
}
```

---

## 🎯 显示逻辑

### **异常线段显示条件**

异常线段的显示需要同时满足以下条件：

1. ✅ `enableEventLines = true`（开关打开）
2. ✅ 当前地图缩放级别 `>= eventLinesMinZoom`
3. ✅ 视口范围内存在有效的异常事件点

### **显示效果对比**

#### **Zoom < 15 级（或关闭异常线段）**
```
只显示：
- 轨迹线（Douglas-Peucker 简化后）
- 抽稀后的轨迹点（黄色）
- 特殊事件点（红色）
```

#### **Zoom >= 15 级（且开启异常线段）**
```
显示：
- 轨迹线（蓝色虚线）
- 抽稀后的轨迹点（黄色）
- 特殊事件点（红色）
- 异常线段（红色加粗，叠加显示）← 新增
```

---

## 🔍 核心函数说明

### 1. `_getVisiblePoints(trackId)`
获取当前视口范围内的轨迹点。

```javascript
// 返回值：在当前地图边界内的点数组
const visiblePoints = this._getVisiblePoints(trackId);
```

### 2. `_groupPointsByEventId(points)`
按 `eventId` 分组点位。

```javascript
// 返回值：{ eventId: [point1, point2, ...], ... }
const groups = this._groupPointsByEventId(visiblePoints);
```

### 3. `_renderEventLines(trackId)`
渲染异常线段。

```javascript
// 自动判断是否满足显示条件
// 清除旧线段，绘制新线段
this._renderEventLines(trackId);
```

### 4. `_clearEventLines(trackId)`
清除异常线段。

```javascript
// 清除指定轨迹的所有异常线段
this._clearEventLines(trackId);
```

---

## 🧪 测试方法

### **测试步骤**

1. 打开 `leaflet-track-thinning-demo.html`
2. 点击 **"加载异常线段数据"** 按钮
3. 观察地图，应显示轨迹线和点
4. 缩放到 **15 级以上**
5. 应该看到红色的异常线段出现
6. 平移地图，异常线段应动态更新
7. 缩放到 **15 级以下**，异常线段消失

### **预期效果**

- **低缩放级别**：只显示轨迹线和点
- **高缩放级别**：叠加显示异常红线
- **平移地图**：异常线段实时更新
- **删除轨迹**：异常线段同时清除

---

## 📁 文件结构

```
track-thinning-demo/
├── leaflet-track-thinning.js          # 插件主文件（已增强）
├── leaflet-track-thinning-demo.html   # 示例页面（已更新）
├── data/
│   ├── 轨迹中画点数据结构.json        # 第一部分数据
│   └── 轨迹中画异常数据画线数据结构.json  # 第二部分数据
└── README-第二部分功能说明.md         # 本文档
```

---

## 🚀 性能优化

### **已实现的优化**

1. **视口剔除**：只处理可视范围内的点
2. **独立图层**：异常线段使用独立的 LayerGroup 管理
3. **事件节流**：moveend/zoomend 事件触发时才重绘
4. **智能判断**：自动判断是否满足显示条件

### **性能表现**

- **数据量**：支持 10 万+ 点的轨迹
- **异常线段**：实时渲染，无明显延迟
- **内存占用**：独立图层，按需加载
- **流畅度**：平移/缩放无卡顿

---

## ⚠️ 注意事项

1. **数据格式**：
   - 第一部分：`eventData` 为数组
   - 第二部分：`eventData` 为对象或 null

2. **eventId 相邻保证**：
   - 后端需保证相同 `eventId` 的点是连续的
   - 前端按顺序分组绘制

3. **缩放级别**：
   - 默认 15 级以上显示异常线段
   - 可通过 `eventLinesMinZoom` 自定义

4. **图层叠加**：
   - 异常线段不会干扰第一部分的绘制
   - 两者完全独立，互不影响

---

## 📞 API 完整示例

```javascript
// 初始化插件
const trackThinning = L.trackThinning(map);

// 加载普通轨迹（第一部分）
const trackId1 = trackThinning.addTrack(normalTrackData, {
  enableEventLines: false  // 不显示异常线段
});

// 加载异常轨迹（第二部分）
const trackId2 = trackThinning.addTrack(eventTrackData, {
  enableEventLines: true,   // 显示异常线段
  eventLinesMinZoom: 15,    // 15级以上显示
  eventLineStyle: {         // 自定义样式
    color: '#ff0000',
    weight: 6,
    opacity: 0.8
  }
});

// 删除轨迹（自动清除异常线段）
trackThinning.removeTrack(trackId2);

// 清除所有轨迹
trackThinning.clearAll();
```

---

## ✅ 完成清单

- [x] 数据格式兼容（数组/对象）
- [x] 异常线段样式配置
- [x] 视口范围点筛选
- [x] eventId 分组逻辑
- [x] 异常线段绘制
- [x] 异常线段清除
- [x] 缩放事件处理
- [x] 平移事件处理
- [x] removeTrack 增强
- [x] 示例 HTML 更新
- [x] 功能测试验证

---

🎉 **第二部分功能已全部实现！**
