/**
 * Leaflet轨迹抽稀绘制插件
 * 支持大数据量轨迹的高性能绘制，使用网格抽稀和Douglas-Peucker算法优化
 */
L.TrackThinning = L.Class.extend({
  options: {
    // 默认轨迹线样式
    trackStyle: {
      color: '#256ac9',      // 轨迹线颜色
      weight: 2,             // 轨迹线宽度
      opacity: 0.8,          // 轨迹线透明度
      lineJoin: 'round',     // 线段连接样式
      lineCap: 'round',      // 线段端点样式
      dashArray: '5, 5',     // 虚线样式
      smoothFactor: 1.0      // 平滑因子
    },
    // 普通轨迹点样式
    pointStyle: {
      radius: 3,             // 点半径
      fillColor: '#ffff00',  // 填充颜色（黄色）
      color: '#ffffff',      // 边框颜色（白色）
      weight: 2,             // 边框宽度
      opacity: 1,            // 透明度
      fillOpacity: 0.8       // 填充透明度
    },
    // 特殊轨迹点样式（有eventData的点）
    eventPointStyle: {
      radius: 4,             // 点半径（稍大）
      fillColor: '#ff0000',  // 填充颜色（红色）
      color: '#ffffff',      // 边框颜色（白色）
      weight: 2,             // 边框宽度
      opacity: 1,            // 透明度
      fillOpacity: 1,        // 填充透明度
      zIndexOffset: 1000     // 提高层级，始终在最上层
    },
    // 异常线段样式（第二部分功能）
    eventLineStyle: {
      color: '#ff0000',      // 红色
      weight: 10,             // 加粗
      opacity: 0.7,          // 带透明度
      lineJoin: 'round',
      lineCap: 'round'
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
    onPointClick: null
  },

  initialize: function(map, options) {
    this.map = map;
    L.setOptions(this, options);

    // 存储所有轨迹数据
    this.tracks = new Map();

    // 渲染器实例
    this.svgRenderer = L.svg();
    this.canvasRenderer = L.canvas();

    this._init();
  },

  _init: function() {
    // 监听地图缩放事件
    this.map.on('zoomend', this._onZoomEnd, this);

    // 监听地图平移事件（用于异常线段更新）
    this.map.on('moveend', this._onMapMove, this);

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
   * Douglas-Peucker轨迹简化算法
   * @param {Array} points - 原始点数组 [{lat, lon, eventData}, ...]
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
        // 起点和终点相同
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

    // 递归简化
    const simplify = (pts, tolerance) => {
      if (pts.length <= 2) return pts;

      let maxDistance = 0;
      let maxIndex = 0;
      const start = pts[0];
      const end = pts[pts.length - 1];

      // 找到距离线段最远的点
      for (let i = 1; i < pts.length - 1; i++) {
        const distance = getPerpendicularDistance(pts[i], start, end);
        if (distance > maxDistance) {
          maxDistance = distance;
          maxIndex = i;
        }
      }

      // 如果最大距离小于容差，直接返回起点和终点
      if (maxDistance < tolerance) {
        return [start, end];
      }

      // 递归处理左右两部分
      const leftPart = simplify(pts.slice(0, maxIndex + 1), tolerance);
      const rightPart = simplify(pts.slice(maxIndex), tolerance);

      // 合并结果（去掉重复的中间点）
      return leftPart.slice(0, -1).concat(rightPart);
    };

    // 保留所有有eventData的点
    const eventPoints = new Set();
    points.forEach((point, index) => {
      if (point.eventData && point.eventData.length > 0) {
        eventPoints.add(index);
      }
    });

    // 先进行Douglas-Peucker简化
    const simplified = simplify(points, tolerance);

    // 将被简化掉的eventData点重新加回去
    const result = [];
    let simplifiedIndex = 0;

    for (let i = 0; i < points.length; i++) {
      if (eventPoints.has(i)) {
        // 如果是特殊点，必须保留
        // 找到应该插入的位置
        while (simplifiedIndex < simplified.length &&
               points.indexOf(simplified[simplifiedIndex]) < i) {
          result.push(simplified[simplifiedIndex]);
          simplifiedIndex++;
        }
        result.push(points[i]);
      } else if (simplifiedIndex < simplified.length &&
                 simplified[simplifiedIndex] === points[i]) {
        result.push(simplified[simplifiedIndex]);
        simplifiedIndex++;
      }
    }

    // 添加剩余的简化点
    while (simplifiedIndex < simplified.length) {
      result.push(simplified[simplifiedIndex]);
      simplifiedIndex++;
    }

    return result;
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

    // 默认返回最小网格
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

    return '15-18'; // 默认返回最高级别
  },

  /**
   * 网格抽稀算法
   * @param {Array} points - 点数组 [{lat, lon, eventData}, ...]
   * @param {Number} gridSize - 网格大小
   * @returns {Array} 抽稀后的点数组
   */
  _thinByGrid: function(points, gridSize) {
    if (gridSize === 0 || points.length === 0) return points;

    const gridMap = new Map();
    const eventPoints = []; // 特殊点必须保留

    points.forEach(point => {
      // 判断是否为特殊点
      // 兼容两种数据格式：数组（第一部分）和对象（第二部分）
      const isEventPoint = Array.isArray(point.eventData)
        ? (point.eventData.length > 0)
        : (point.eventData !== null && point.eventData !== undefined);

      // 特殊点单独处理
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

    // 合并普通点和特殊点
    return [...gridMap.values(), ...eventPoints];
  },

  /**
   * 添加轨迹
   * @param {Array} data - 轨迹数据 [{lon, lat, eventData}, ...]
   * @param {Object} options - 可选配置
   * @param {Boolean} options.enableEventLines - 是否启用异常线段绘制（默认 false）
   * @param {Number} options.eventLinesMinZoom - 异常线段显示的最小缩放级别（默认 15）
   * @returns {String} 轨迹ID
   */
  addTrack: function(data, options = {}) {
    const trackId = this._generateUUID();

    // 转换数据格式（保持原始 eventData 结构）
    const points = data.map(item => ({
      lat: item.lat,
      lon: item.lon,
      eventData: item.eventData !== undefined ? item.eventData : []
    }));

    // 合并样式配置
    const trackStyle = L.extend({}, this.options.trackStyle, options.trackStyle || {});
    const pointStyle = L.extend({}, this.options.pointStyle, options.pointStyle || {});
    const eventPointStyle = L.extend({}, this.options.eventPointStyle, options.eventPointStyle || {});
    const eventLineStyle = L.extend({}, this.options.eventLineStyle, options.eventLineStyle || {});

    // 第二部分功能配置
    const enableEventLines = options.enableEventLines || false;
    const eventLinesMinZoom = options.eventLinesMinZoom || 15;

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

    // 创建异常线段图层组（设置低层级，不遮挡 marker）
    const eventLinesLayer = L.layerGroup();
    eventLinesLayer.addTo(this.map);

    // 将异常线段图层移到最底层（polyline 和 marker 之间）
    if (eventLinesLayer.getPane) {
      const pane = this.map.createPane('eventLinesPane-' + trackId);
      pane.style.zIndex = 400; // polyline默认400，marker默认600，设置为400让其在polyline层
      eventLinesLayer.options.pane = 'eventLinesPane-' + trackId;
    }

    // 存储轨迹数据
    const trackData = {
      id: trackId,
      originalPoints: points,           // 原始完整数据
      simplifiedLinePoints: simplifiedLinePoints, // Douglas-Peucker简化后的线点
      polyline: polyline,
      markers: [],
      renderer: renderer,
      style: {
        trackStyle: trackStyle,
        pointStyle: pointStyle,
        eventPointStyle: eventPointStyle,
        eventLineStyle: eventLineStyle
      },
      cache: new Map(), // 缓存各缩放级别的抽稀结果
      options: options,
      // 第二部分功能字段
      enableEventLines: enableEventLines,
      eventLinesMinZoom: eventLinesMinZoom,
      eventLinesLayer: eventLinesLayer
    };

    this.tracks.set(trackId, trackData);

    // 绘制当前缩放级别的点
    this._renderTrackPoints(trackId);

    // 绘制异常线段（如果启用）
    this._renderEventLines(trackId);

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
      // 兼容两种数据格式判断是否为特殊点
      const isEventPoint = Array.isArray(point.eventData)
        ? (point.eventData.length > 0)
        : (point.eventData !== null && point.eventData !== undefined);

      const style = isEventPoint ? track.style.eventPointStyle : track.style.pointStyle;

      const marker = L.circleMarker([point.lat, point.lon], {
        ...style,
        renderer: track.renderer
      }).addTo(this.map);

      // 绑定点击事件
      marker.on('click', () => {
        if (this.options.onPointClick) {
          this.options.onPointClick({
            trackId: trackId,
            lat: point.lat,
            lon: point.lon,
            eventData: point.eventData
          });
        }
      });

      // 添加tooltip
      if (isEventPoint) {
        marker.bindTooltip(`特殊事件点<br>经度: ${point.lon.toFixed(6)}<br>纬度: ${point.lat.toFixed(6)}`, {
          direction: 'top',
          offset: [0, -5]
        });
      }

      track.markers.push(marker);
    });
  },

  /**
   * 获取视口范围内的点
   * @param {String} trackId - 轨迹ID
   * @returns {Array} 视口内的点数组
   */
  _getVisiblePoints: function(trackId) {
    const track = this.tracks.get(trackId);
    if (!track) return [];

    const bounds = this.map.getBounds();

    return track.originalPoints.filter(point =>
      bounds.contains([point.lat, point.lon])
    );
  },

  /**
   * 按 eventId 分组点位
   * @param {Array} points - 点数组
   * @returns {Object} 分组结果 {eventId: [points]}
   */
  _groupPointsByEventId: function(points) {
    const groups = {};

    points.forEach(point => {
      // 只处理对象格式的 eventData（第二部分数据）
      if (point.eventData && typeof point.eventData === 'object' && !Array.isArray(point.eventData)) {
        const eventId = point.eventData.eventId;
        if (eventId) {
          if (!groups[eventId]) {
            groups[eventId] = [];
          }
          groups[eventId].push(point);
        }
      }
    });

    return groups;
  },

  /**
   * 清除异常线段
   * @param {String} trackId - 轨迹ID
   */
  _clearEventLines: function(trackId) {
    const track = this.tracks.get(trackId);
    if (!track || !track.eventLinesLayer) return;

    track.eventLinesLayer.clearLayers();
  },

  /**
   * 渲染异常线段
   * @param {String} trackId - 轨迹ID
   */
  _renderEventLines: function(trackId) {
    const track = this.tracks.get(trackId);
    if (!track) return;

    // 清除旧的异常线段
    this._clearEventLines(trackId);

    // 判断是否应该显示异常线段
    if (!track.enableEventLines) return;

    const zoom = this.map.getZoom();
    if (zoom < track.eventLinesMinZoom) return;

    // 获取视口内的点
    const visiblePoints = this._getVisiblePoints(trackId);

    // 按 eventId 分组
    const groups = this._groupPointsByEventId(visiblePoints);

    // 绘制异常线段
    Object.entries(groups).forEach(([eventId, pointsGroup]) => {
      // 只有 2 个及以上点才绘制
      if (pointsGroup.length >= 2) {
        const lineCoords = pointsGroup.map(p => [p.lat, p.lon]);

        // 创建异常线段，使用 pane 确保层级低于 marker
        const eventLineOptions = {
          ...track.style.eventLineStyle,
          interactive: false  // 设置为不可交互，让点击事件穿透到下层的 marker
        };

        // 如果有自定义 pane，使用自定义 pane
        if (track.eventLinesLayer.options.pane) {
          eventLineOptions.pane = track.eventLinesLayer.options.pane;
        }

        const eventLine = L.polyline(lineCoords, eventLineOptions);

        // 添加到异常线段图层组
        track.eventLinesLayer.addLayer(eventLine);
      }
    });
  },

  /**
   * 地图平移事件处理
   */
  _onMapMove: function() {
    // 更新所有启用异常线段的轨迹
    this.tracks.forEach((track, trackId) => {
      if (track.enableEventLines) {
        this._renderEventLines(trackId);
      }
    });
  },

  /**
   * 地图缩放事件处理
   */
  _onZoomEnd: function() {
    // 重新渲染所有轨迹的点
    this.tracks.forEach((track, trackId) => {
      this._renderTrackPoints(trackId);

      // 重新渲染异常线段
      if (track.enableEventLines) {
        this._renderEventLines(trackId);
      }
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

    // 移除异常线段图层
    if (track.eventLinesLayer) {
      this.map.removeLayer(track.eventLinesLayer);
    }

    // 移除自定义 pane
    const paneName = 'eventLinesPane-' + trackId;
    if (this.map.getPane(paneName)) {
      const pane = this.map.getPane(paneName);
      if (pane && pane.parentNode) {
        pane.parentNode.removeChild(pane);
      }
    }

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
    this.map.fitBounds(bounds, fitOptions);

    return true;
  },

  /**
   * 添加样式
   */
  addStyles: function() {
    if (document.getElementById('leaflet-track-thinning-styles')) return;

    const style = document.createElement('style');
    style.id = 'leaflet-track-thinning-styles';
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
  }
});

// 工厂函数
L.trackThinning = function(map, options) {
  return new L.TrackThinning(map, options);
};
