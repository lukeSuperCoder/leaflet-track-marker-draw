/**
 * Leaflet事件点轨迹抽稀绘制插件
 * 支持大数据量事件点轨迹的高性能绘制，使用网格抽稀和Douglas-Peucker算法优化
 * 根据eventid显示不同颜色的marker，支持高亮闪烁特殊点位
 */
L.EventTrackThinning = L.Class.extend({
  options: {
    // 默认轨迹线样式
    trackStyle: {
      color: '#dc3c96',      // 轨迹线颜色
      weight: 2,             // 轨迹线宽度
      opacity: 0.8,          // 轨迹线透明度
      lineJoin: 'round',     // 线段连接样式
      lineCap: 'round',      // 线段端点样式
      dashArray: '5, 5',     // 虚线样式
      smoothFactor: 1.0      // 平滑因子
    },
    // Canvas渲染器阈值
    canvasThreshold: 5000,
    // Douglas-Peucker算法容差值（经纬度单位）
    dpTolerance: 0.00001,
    // 网格抽稀配置（按缩放级别范围）
    gridConfig: {
        '1-5': 0.5,
        '6-8': 0.1,
        '9-11': 0.05,
        '12-14': 0.01,
        '15-18': 0.0001
    },
    // 点击事件回调
    onPointClick: null,
    // 事件配置字典
    eventConfig: {
      // 到离事件
      1: { eventName: '靠泊事件', type: '1', color: '#E539CF' },
      2: { eventName: '离泊事件', type: '2', color: '#E539CF' },
      3: { eventName: '到锚事件', type: '3', color: '#E539CF' },
      4: { eventName: '离锚事件', type: '4', color: '#E539CF' },
      // 速度变化
      7: { eventName: '停止(<0.5kn)', type: '7', color: '#ED1B24' },
      9: { eventName: '低速航行(0.5kn~5kn)', type: '9', color: '#ED1B24' },
      11: { eventName: '正常航行(5kn~20kn)', type: '11', color: '#ED1B24' },
      10: { eventName: '高速航行(>20kn)', type: '10', color: '#ED1B24' },
      // 航行改变
      13: { eventName: '吃水改变', type: '13', color: '#474BFF' },
      14: { eventName: 'ETA改变', type: '14', color: '#474BFF' },
      15: { eventName: '目的地改变', type: '15', color: '#474BFF' },
      12: { eventName: '航向改变', type: '12', color: '#474BFF' },
      33: { eventName: '船名改变', type: '33', color: '#474BFF' },
      // 到离特殊区域
      16: { eventName: '到海峡区', type: '16', color: '#009345' },
      17: { eventName: '离海峡区', type: '17', color: '#009345' },
      18: { eventName: '到运河区', type: '18', color: '#009345' },
      19: { eventName: '离运河区', type: '19', color: '#009345' },
      20: { eventName: '到海盗区', type: '20', color: '#009345' },
      21: { eventName: '离海盗区', type: '21', color: '#009345' },
      24: { eventName: '到ECA低硫区', type: '24', color: '#009345' },
      25: { eventName: '离ECA低硫区', type: '25', color: '#009345' },
      // 其他事件
      30: { eventName: '定时报告', type: '30', color: '#FFE300' },
      28: { eventName: '船靠船(开始)', type: '28', color: '#FFE300' },
      29: { eventName: '船靠船(结束)', type: '29', color: '#FFE300' },
      31: { eventName: '信号中断', type: '31', color: '#FFE300' },
      32: { eventName: '信号恢复', type: '32', color: '#FFE300' }
    },
    // 默认marker样式
    defaultMarkerStyle: {
      radius: 6,
      fillColor: '#E539CF',  // 默认颜色
      color: '#ffffff',
      weight: 0,
      opacity: 1,
      fillOpacity: 1
    },
    // 高亮marker样式
    highlightMarkerStyle: {
      radius: 7,
      fillColor: '#FF0000',
      color: '#FFFF00',      // 黄色边框用于闪烁
      weight: 2,
      opacity: 1,
      fillOpacity: 1,
      zIndexOffset: 2000     // 最高层级
    },
    // 高亮闪烁间隔（毫秒）
    blinkInterval: 500
  },

  initialize: function(map, options) {
    this.map = map;
    this.map._eventTrackThinningInstance = this;
    L.setOptions(this, options);

    // 存储所有轨迹数据（使用不可枚举属性，防止Vue响应式系统劫持）
    Object.defineProperty(this, 'tracks', {
      value: new Map(),
      writable: true,
      enumerable: false,
      configurable: true
    });

    // 存储高亮标记（使用不可枚举属性，防止Vue响应式系统劫持）
    Object.defineProperty(this, 'highlights', {
      value: new Map(),
      writable: true,
      enumerable: false,
      configurable: true
    });

    // 标记是否正在进行程序化定位（防止递归）
    this._isLocating = false;

    // 渲染器实例（使用不可枚举属性，防止Vue响应式系统劫持）
    Object.defineProperty(this, 'svgRenderer', {
      value: L.svg(),
      writable: true,
      enumerable: false,
      configurable: true
    });

    Object.defineProperty(this, 'canvasRenderer', {
      value: L.canvas(),
      writable: true,
      enumerable: false,
      configurable: true
    });

    this._init();
  },

  _init: function() {
    // 监听地图缩放事件
    this.map.on('zoomend', this._onZoomEnd, this);

    // 添加样式
    this.addStyles();
  },

  /**
   * 生成UUID
   */
  _generateUUID: function() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },

  /**
   * 格式化时间戳
   * @param {Number} timestamp - Unix时间戳（秒）
   * @returns {String} 格式化后的时间字符串 yyyy-MM-dd HH:mm:ss
   */
  _formatTime: function(timestamp) {
    if (!timestamp) return '';

    const date = new Date(timestamp * 1000); // 转换为毫秒
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  },

  /**
   * 根据eventid获取事件颜色
   * @param {Number} eventid - 事件ID
   * @returns {String} 颜色值
   */
  _getEventColor: function(eventid) {
    const config = this.options.eventConfig[eventid];
    return config ? config.color : this.options.defaultMarkerStyle.fillColor;
  },

  /**
   * 创建事件tooltip内容
   * @param {Object} event - 事件数据对象
   * @returns {String} Tooltip HTML内容
   */
  _createEventTooltip: function(event) {
    if (!event || !event.eventid) return '';

    const config = this.options.eventConfig[event.eventid];
    const eventName = config ? config.eventName : '未知事件';
    const timeStr = this._formatTime(event.happentime);

    return `<strong>${eventName}</strong><br/>时间: ${timeStr}`;
  },

  /**
   * Douglas-Peucker轨迹简化算法
   * @param {Array} points - 原始点数组 [{lat, lon, ...}, ...]
   * @param {Number} tolerance - 容差值
   * @returns {Array} 简化后的点数组
   */
  _simplifyDouglasPeucker: function(points, tolerance) {
    if (points.length <= 2) return points;

    // 计算点到线段的垂直距离
    const getPerpendicularDistance = (point, lineStart, lineEnd) => {
      const lat = point.lat;
      const lon = point.lon;
      const lat1 = lineStart.lat;
      const lon1 = lineStart.lon;
      const lat2 = lineEnd.lat;
      const lon2 = lineEnd.lon;

      const dx = lon2 - lon1;
      const dy = lat2 - lat1;

      if (dx === 0 && dy === 0) {
        return Math.sqrt((lon - lon1) ** 2 + (lat - lat1) ** 2);
      }

      const t = ((lon - lon1) * dx + (lat - lat1) * dy) / (dx * dx + dy * dy);

      if (t < 0) {
        return Math.sqrt((lon - lon1) ** 2 + (lat - lat1) ** 2);
      } else if (t > 1) {
        return Math.sqrt((lon - lon2) ** 2 + (lat - lat2) ** 2);
      } else {
        const projX = lon1 + t * dx;
        const projY = lat1 + t * dy;
        return Math.sqrt((lon - projX) ** 2 + (lat - projY) ** 2);
      }
    };

    // 使用栈来代替递归，避免栈溢出
    const simplify = (pts, tolerance) => {
      if (pts.length <= 2) return pts;

      const stack = [[0, pts.length - 1]];
      const keepIndices = new Set([0, pts.length - 1]);

      while (stack.length > 0) {
        const [startIdx, endIdx] = stack.pop();

        if (endIdx - startIdx <= 1) continue;

        let maxDistance = 0;
        let maxIndex = startIdx;
        const start = pts[startIdx];
        const end = pts[endIdx];

        for (let i = startIdx + 1; i < endIdx; i++) {
          const distance = getPerpendicularDistance(pts[i], start, end);
          if (distance > maxDistance) {
            maxDistance = distance;
            maxIndex = i;
          }
        }

        if (maxDistance >= tolerance) {
          keepIndices.add(maxIndex);
          stack.push([startIdx, maxIndex]);
          stack.push([maxIndex, endIdx]);
        }
      }

      // 返回保留的点
      return Array.from(keepIndices).sort((a, b) => a - b).map(i => pts[i]);
    };

    // 保留所有有eventid的事件点
    const eventPoints = new Set();
    points.forEach((point, index) => {
      if (point.eventid !== undefined && point.eventid !== null) {
        eventPoints.add(index);
      }
    });

    // 先进行Douglas-Peucker简化
    const simplified = simplify(points, tolerance);

    // 将被简化掉的事件点重新加回去
    const simplifiedIndices = new Set();
    simplified.forEach(point => {
      const index = points.indexOf(point);
      if (index !== -1) simplifiedIndices.add(index);
    });

    // 合并简化点和事件点的索引
    const finalIndices = new Set([...simplifiedIndices, ...eventPoints]);

    // 按照原始顺序返回点
    return Array.from(finalIndices).sort((a, b) => a - b).map(i => points[i]);
  },

  /**
   * 获取当前缩放级别对应的网格大小
   */
  _getGridSize: function(zoom) {
    const config = this.options.gridConfig;

    for (const range in config) {
      const [min, max] = range.split('-').map(Number);
      if (zoom >= min && zoom <= max) {
        return config[range];
      }
    }

    return 0.0001;
  },

  /**
   * 获取当前缩放级别的范围标识
   */
  _getZoomRange: function(zoom) {
    const config = this.options.gridConfig;

    for (const range in config) {
      const [min, max] = range.split('-').map(Number);
      if (zoom >= min && zoom <= max) {
        return range;
      }
    }

    return '15-18';
  },

  /**
   * 网格抽稀算法
   * @param {Array} points - 点数组
   * @param {Number} gridSize - 网格大小
   * @returns {Array} 抽稀后的点数组
   */
  _thinByGrid: function(points, gridSize) {
    if (gridSize === 0 || points.length === 0) return points;

    const gridMap = new Map();
    const eventPoints = []; // 事件点必须保留

    points.forEach(point => {
      // 判断是否为事件点（有eventid字段）
      const isEventPoint = point.eventid !== undefined && point.eventid !== null;

      // 事件点单独处理
      if (isEventPoint) {
        eventPoints.push(point);
        return;
      }

      // 计算网格坐标
      const gridX = Math.floor(point.lon / gridSize);
      const gridY = Math.floor(point.lat / gridSize);
      const gridKey = `${gridX}_${gridY}`;

      // 每个网格只保留第一个点
      if (!gridMap.has(gridKey)) {
        gridMap.set(gridKey, point);
      }
    });

    // 合并普通点和事件点
    return [...gridMap.values(), ...eventPoints];
  },

  /**
   * 添加轨迹
   * @param {Array} data - 轨迹数据 [{lon, lat, happentime, eventid, ...}, ...]
   * @param {Object} options - 可选配置
   * @returns {String} 轨迹ID
   */
  addTrack: function(data, options = {}) {
    const trackId = this._generateUUID();

    // 转换数据格式（保留所有原始字段）
    const points = data.map(item => ({...item}));

    // 合并样式配置
    const trackStyle = L.extend({}, this.options.trackStyle, options.trackStyle || {});

    // 选择渲染器
    const renderer = points.length > this.options.canvasThreshold
      ? this.canvasRenderer
      : this.svgRenderer;

    // 使用Douglas-Peucker简化轨迹线
    const simplifiedLinePoints = this._simplifyDouglasPeucker(
      points,
      this.options.dpTolerance
    );

    // 创建轨迹线（使用简化后的点）
    const lineCoords = simplifiedLinePoints.map(p => [p.lat, p.lon]);
    const polyline = L.polyline(lineCoords, {
      ...trackStyle,
      renderer: renderer
    }).addTo(this.map);

    // 存储轨迹数据
    const trackData = {
      id: trackId,
      originalPoints: points,
      simplifiedLinePoints: simplifiedLinePoints,
      polyline: polyline,
      markers: [],
      renderer: renderer,
      style: {
        trackStyle: trackStyle
      },
      cache: new Map(),
      options: options
    };

    this.tracks.set(trackId, trackData);

    // 绘制当前缩放级别的点
    this._renderTrackPoints(trackId);

    return trackId;
  },

  /**
   * 渲染轨迹点（根据当前缩放级别）
   */
  _renderTrackPoints: function(trackId) {
    const track = this.tracks.get(trackId);
    if (!track) return;

    // 清除旧的点标记
    track.markers.forEach(marker => this.map.removeLayer(marker));
    track.markers = [];

    const zoom = this.map.getZoom();
    const zoomRange = this._getZoomRange(zoom);

    // 检查缓存
    let thinnedPoints;
    if (track.cache.has(zoomRange)) {
      thinnedPoints = track.cache.get(zoomRange);
    } else {
      // 执行网格抽稀
      const gridSize = this._getGridSize(zoom);
      thinnedPoints = this._thinByGrid(track.originalPoints, gridSize);

      // 缓存结果
      track.cache.set(zoomRange, thinnedPoints);
    }

    // 绘制点
    thinnedPoints.forEach(point => {
      // 判断是否为事件点
      const isEventPoint = point.eventid !== undefined && point.eventid !== null;

      // 根据eventid获取颜色
      const fillColor = isEventPoint ? this._getEventColor(point.eventid) : this.options.defaultMarkerStyle.fillColor;

      const markerStyle = {
        ...this.options.defaultMarkerStyle,
        fillColor: fillColor,
        renderer: track.renderer
      };

      const marker = L.circleMarker([point.lat, point.lon], markerStyle).addTo(this.map);

      // 绑定点击事件
      marker.on('click', () => {
        if (this.options.onPointClick) {
          this.options.onPointClick({
            trackId: trackId,
            lat: point.lat,
            lon: point.lon,
            data: point
          });
        }
      });

      // 添加tooltip（只对事件点）
      if (isEventPoint) {
        const tooltipContent = this._createEventTooltip(point);
        marker.bindTooltip(tooltipContent, {
          direction: 'top',
          offset: [0, -5]
        });
      }

      track.markers.push(marker);
    });
  },

  /**
   * 高亮指定经纬度的点，并添加闪烁效果
   * @param {Number} lat - 纬度
   * @param {Number} lon - 经度
   * @param {Object} options - 可选配置
   * @param {Object} options.style - 自定义高亮样式
   * @param {String} options.tooltip - Tooltip内容
   * @param {Boolean} options.permanentTooltip - 是否永久显示tooltip
   * @param {Boolean} options.locate - 是否定位到该点，默认true
   * @param {Object} options.locateOptions - 定位配置
   * @param {Number} options.locateOptions.zoom - 定位缩放级别，默认16
   * @param {Boolean} options.locateOptions.animate - 是否使用动画，默认true
   * @param {Number} options.locateOptions.duration - 动画持续时间（秒），默认1
   * @param {Array} options.locateOptions.padding - 定位边距，默认[50, 50]
   * @returns {String} 高亮ID，用于后续清除
   */
  highlightPoint: function(lat, lon, options = {}) {
    const highlightId = this._generateUUID();

    // 合并样式
    const style = L.extend({}, this.options.highlightMarkerStyle, options.style || {});

    // 创建高亮marker
    const marker = L.circleMarker([lat, lon], style).addTo(this.map);

    // 添加tooltip（如果提供）
    if (options.tooltip) {
      marker.bindTooltip(options.tooltip, {
        direction: 'top',
        offset: [0, -8],
        permanent: options.permanentTooltip || false
      });
    }

    // 闪烁效果：切换边框显隐
    let visible = true;
    const blinkInterval = setInterval(() => {
      visible = !visible;
      marker.setStyle({
        color: visible ? style.color : 'transparent'
      });
    }, this.options.blinkInterval);

    // 存储高亮信息
    this.highlights.set(highlightId, {
      id: highlightId,
      marker: marker,
      blinkInterval: blinkInterval
    });

    // 地图定位功能（默认开启）
    if (options.locate !== false) {
      const locateOptions = options.locateOptions || {};

      const defaultLocateOptions = {
        zoom: 16,
        animate: true,
        duration: 1,
        padding: [50, 50]
      };

      const finalOptions = L.extend({}, defaultLocateOptions, locateOptions);

      // 设置定位标记，防止递归
      this._isLocating = true;

      // 根据配置决定定位方式
      if (finalOptions.zoom !== undefined && finalOptions.zoom !== null) {
        // 使用setView方式定位到指定缩放级别
        this.map.setView([lat, lon], finalOptions.zoom, {
          animate: finalOptions.animate,
          duration: finalOptions.duration
        });
      } else {
        // 使用fitBounds方式，应用padding
        const bounds = L.latLngBounds([[lat, lon]]);
        this.map.fitBounds(bounds, {
          padding: finalOptions.padding,
          animate: finalOptions.animate,
          duration: finalOptions.duration
        });
      }

      // 延迟重置定位标记，确保缩放事件处理完成
      setTimeout(() => {
        this._isLocating = false;
      }, finalOptions.animate ? (finalOptions.duration * 1000 + 100) : 100);
    }

    return highlightId;
  },

  /**
   * 清除指定的高亮标记
   * @param {String} highlightId - 高亮ID
   * @returns {Boolean} 是否成功清除
   */
  clearHighlight: function(highlightId) {
    const highlight = this.highlights.get(highlightId);
    if (!highlight) return false;

    // 清除闪烁定时器
    clearInterval(highlight.blinkInterval);

    // 移除marker
    this.map.removeLayer(highlight.marker);

    // 从Map中删除
    this.highlights.delete(highlightId);

    return true;
  },

  /**
   * 清除所有高亮标记
   */
  clearAllHighlights: function() {
    this.highlights.forEach((highlight, highlightId) => {
      this.clearHighlight(highlightId);
    });
  },

  /**
   * 地图缩放事件处理
   */
  _onZoomEnd: function() {
    // 如果正在进行程序化定位，跳过重新渲染（防止递归）
    if (this._isLocating) {
      return;
    }

    // 重新渲染所有轨迹的点
    this.tracks.forEach((track, trackId) => {
      this._renderTrackPoints(trackId);
    });
  },

  /**
   * 删除轨迹
   */
  removeTrack: function(trackId) {
    const track = this.tracks.get(trackId);
    if (!track) return false;

    // 移除轨迹线
    this.map.removeLayer(track.polyline);

    // 移除所有点标记
    track.markers.forEach(marker => this.map.removeLayer(marker));

    // 清除缓存
    track.cache.clear();

    // 从Map中删除
    this.tracks.delete(trackId);

    return true;
  },

  /**
   * 清除所有轨迹
   */
  clearAll: function() {
    this.tracks.forEach((track, trackId) => {
      this.removeTrack(trackId);
    });
  },

  /**
   * 获取轨迹信息
   */
  getTrack: function(trackId) {
    const track = this.tracks.get(trackId);
    if (!track) return null;

    return {
      id: trackId,
      pointCount: track.originalPoints.length,
      simplifiedPointCount: track.simplifiedLinePoints.length,
      cacheInfo: Array.from(track.cache.keys())
    };
  },

  /**
   * 获取所有轨迹ID
   */
  getAllTrackIds: function() {
    return Array.from(this.tracks.keys());
  },

  /**
   * 定位到指定轨迹
   */
  locateTrack: function(trackId, options = {}) {
    const track = this.tracks.get(trackId);
    if (!track) return false;

    const bounds = L.latLngBounds(
      track.originalPoints.map(p => [p.lat, p.lon])
    );

    const defaultOptions = {
      padding: [50, 50],
      maxZoom: 16,
      animate: true,
      duration: 1
    };

    const fitOptions = L.extend({}, defaultOptions, options);

    // 设置定位标记，防止递归
    this._isLocating = true;

    this.map.fitBounds(bounds, fitOptions);

    // 延迟重置定位标记，确保缩放事件处理完成
    setTimeout(() => {
      this._isLocating = false;
    }, fitOptions.animate ? (fitOptions.duration * 1000 + 100) : 100);

    return true;
  },

  /**
   * 添加样式
   */
  addStyles: function() {
    if (document.getElementById('leaflet-event-track-thinning-styles')) return;

    const style = document.createElement('style');
    style.id = 'leaflet-event-track-thinning-styles';
    style.innerHTML = `
      .leaflet-interactive {
        cursor: pointer;
      }

      .leaflet-interactive:hover {
        opacity: 0.8;
      }
    `;

    document.head.appendChild(style);
  },

  /**
   * 销毁插件
   */
  destroy: function() {
    // 移除事件监听
    this.map.off('zoomend', this._onZoomEnd, this);

    // 清除所有轨迹
    this.clearAll();

    // 清除所有高亮
    this.clearAllHighlights();
  }
});

// 工厂函数
L.eventTrackThinning = function(map, options) {
  return new L.EventTrackThinning(map, options);
};
