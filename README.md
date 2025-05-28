# Leaflet Track Marker Drawer

一个功能强大的 Leaflet 轨迹和图标绘制插件，支持轨迹绘制、图标标记、样式自定义等功能。

## 功能特点

- 轨迹绘制与管理
  - 添加、删除、更新轨迹
  - 支持轨迹点显示
  - 支持轨迹起点图标
  - 轨迹样式自定义
  - 轨迹定位功能
  - 轨迹点追加功能

- 图标标记功能
  - 单个图标添加
  - 批量图标添加
  - 图标定位功能
  - 图标样式自定义
  - 图标弹出框支持

## 引入方式

1. 引入 Leaflet 相关文件：

```html
<link rel="stylesheet" href="path/to/leaflet.css" />
<script src="path/to/leaflet.js"></script>
```

2. 引入插件文件：

```html
<script src="path/to/leaflet-track-drawer.js"></script>
```

## 基本使用

### 初始化

```javascript
// 创建地图实例
const map = L.map('map').setView([39.9, 116.3], 13);

// 添加底图
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// 初始化轨迹绘制工具
const trackDrawer = L.trackMarkerDrawer(map, {
  // 可选配置项
  trackStyle: {
    color: '#3388ff',      // 轨迹线颜色
    weight: 2,             // 轨迹线宽度
    opacity: 0.8,          // 轨迹线透明度
    lineJoin: 'round',     // 线段连接样式
    lineCap: 'round',      // 线段端点样式
    dashArray: null,       // 虚线样式，null为实线
    smoothFactor: 1.0      // 平滑因子
  },
  pointStyle: {
    radius: 2,             // 点半径
    fillColor: '#3388ff',  // 填充颜色
    color: '#3388ff',      // 边框颜色
    weight: 1,             // 边框宽度
    opacity: 1,            // 透明度
    fillOpacity: 0.8       // 填充透明度
  },
  iconStyle: {
    iconUrl: 'path/to/icon.png',  // 图标URL
    iconSize: [25, 41],           // 图标大小
    iconAnchor: [12, 41],         // 图标锚点
    popupAnchor: [1, -34]         // 弹出框锚点
  }
});
```

### 轨迹操作

#### 添加轨迹

```javascript
const points = [
  [39.9, 116.3],
  [39.91, 116.31],
  [39.92, 116.32]
];

const trackId = trackDrawer.addTrack(points, {
  showPoints: true,                // 是否显示轨迹点
  showStartIcon: true,            // 是否显示起点图标
  startIconStyle: {               // 起点图标样式
    iconUrl: 'path/to/start-icon.png'
  },
  startIconTitle: '轨迹起点',      // 起点图标标题
  startIconPopup: '这是轨迹起点',  // 起点弹出框内容
  trackStyle: {                   // 轨迹线样式
    color: '#ff0000'
  },
  pointStyle: {                   // 轨迹点样式
    color: '#ff0000',
    fillColor: '#ff0000'
  }
});
```

#### 更新轨迹

```javascript
const newPoints = [
  [39.9, 116.3],
  [39.91, 116.32],
  [39.92, 116.33]
];

trackDrawer.updateTrack(trackId, newPoints, {
  trackStyle: {
    color: '#00ff00'
  }
});
```

#### 追加轨迹点

```javascript
const appendPoints = [
  [39.93, 116.34],
  [39.94, 116.35]
];

trackDrawer.appendTrackPoints(trackId, appendPoints);
```

#### 删除轨迹

```javascript
trackDrawer.removeTrack(trackId);
```

#### 定位轨迹

```javascript
trackDrawer.locateTrack(trackId, {
  padding: [50, 50],    // 视图边距
  maxZoom: 18,          // 最大缩放级别
  animate: true,        // 使用动画
  duration: 1           // 动画持续时间（秒）
});
```

### 图标标记操作

#### 添加单个图标

```javascript
const point = [39.9, 116.3];
const markerId = trackDrawer.addIconMarker(point, {
  iconStyle: {
    iconUrl: 'path/to/icon.png'
  },
  title: '图标标题',
  popup: '图标描述',
  locate: true,                    // 是否定位到图标位置
  locateOptions: {
    zoom: 16,                      // 定位时的缩放级别
    animate: true,                 // 使用动画
    duration: 0.5                  // 动画持续时间（秒）
  }
});
```

#### 批量添加图标

```javascript
const points = [
  [39.9, 116.3],
  [39.91, 116.31],
  [39.92, 116.32]
];

const markerIds = trackDrawer.addIconMarkers(points, {
  iconStyle: {
    iconUrl: 'path/to/icon.png'
  },
  title: '批量图标',
  popup: '批量添加的图标',
  locate: true,                    // 是否定位到图标位置
  locateOptions: {
    zoom: 14,                      // 定位时的缩放级别
    animate: true,                 // 使用动画
    duration: 0.5,                 // 动画持续时间（秒）
    fitBounds: true,               // 适应所有图标范围
    padding: [100, 100]            // 边距
  }
});
```

#### 删除图标

```javascript
// 删除单个图标
trackDrawer.removeIconMarker(markerId);

// 删除多个图标
trackDrawer.removeIconMarkers([markerId1, markerId2]);

// 清除所有图标
trackDrawer.clearAllIconMarkers();
```

### 其他功能

#### 获取轨迹信息

```javascript
const track = trackDrawer.getTrack(trackId);
console.log(track.points);    // 轨迹点数组
console.log(track.style);     // 轨迹样式
```

#### 获取所有轨迹ID

```javascript
const trackIds = trackDrawer.getAllTrackIds();
```

#### 清除所有内容

```javascript
trackDrawer.clearAll();  // 清除所有轨迹和图标
```

## 示例

查看 `leaflet-track-demo.html` 文件获取完整的使用示例。

## 注意事项

1. 确保在使用插件前已正确引入 Leaflet 相关文件
2. 轨迹点和图标坐标格式为 `[纬度, 经度]`
3. 所有样式配置项都是可选的，会使用默认值
4. 图标定位功能需要合理设置缩放级别，避免视图范围过大或过小

## 浏览器支持

- Chrome
- Firefox
- Safari
- Edge
- IE 11+

## 依赖

- Leaflet 1.7.0 或更高版本 