/**
 * Leaflet轨迹绘制工具插件
 * 提供轨迹绘制功能，支持添加、删除、更新轨迹，以及自定义轨迹样式
 */
L.TrackMarkerDrawer = L.Class.extend({
  options: {
    position: 'topleft',
    language: 'zh',
    // 默认轨迹样式
    trackStyle: {
      color: '#3388ff',      // 轨迹线颜色
      weight: 2,             // 轨迹线宽度
      opacity: 0.8,          // 轨迹线透明度
      lineJoin: 'round',     // 线段连接样式
      lineCap: 'round',      // 线段端点样式
      dashArray: null,       // 虚线样式，null为实线
      smoothFactor: 1.0      // 平滑因子
    },
    // 轨迹点样式
    pointStyle: {
      radius: 2,             // 点半径
      fillColor: '#3388ff',  // 填充颜色
      color: '#3388ff',      // 边框颜色
      weight: 1,             // 边框宽度
      opacity: 1,            // 透明度
      fillOpacity: 0.8       // 填充透明度
    },
    // 默认图标样式
    iconStyle: {
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    }
  },

  initialize: function(map, options) {
    this.map = map;
    L.setOptions(this, options);
    
    // 存储所有轨迹图层，使用Map结构便于通过id管理
    this.tracks = new Map();
    
    // 存储独立的IconMarker图层组
    this.iconMarkerLayers = new Map();
    
    this._init();
  },

  _init: function() {
    // 初始化样式
    this.addStyles();
  },

  /**
   * 生成UUID v4
   * @returns {String} UUID字符串
   */
  _generateUUID: function() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },

  /**
   * 创建IconMarker
   * @param {Array} point - 点位坐标 [lat, lng]
   * @param {Object} options - 图标配置选项
   * @param {String|HTMLElement|Function} options.tooltip - 自定义tooltip内容，支持HTML字符串、DOM元素或返回内容的函数
   * @param {Object} options.tooltipOptions - tooltip配置选项
   * @returns {L.Marker} Leaflet Marker对象
   */
  _createIconMarker: function(point, options = {}) {
    const iconOptions = L.extend({}, this.options.iconStyle, options.iconStyle || {});
    const icon = L.icon(iconOptions);
    
    const marker = L.marker(point, {
      icon: icon,
      title: options.title || '',
      alt: options.alt || '',
      riseOnHover: options.riseOnHover || false
    });

    // 添加弹出框（如果有）
    if (options.popup) {
      marker.bindPopup(options.popup);
    }

    // 添加tooltip（如果有）
    if (options.tooltip) {
      const tooltipContent = typeof options.tooltip === 'function' 
        ? options.tooltip() 
        : options.tooltip;

      const tooltipOptions = L.extend({
        permanent: false,           // 是否永久显示
        direction: 'top',          // 显示方向
        offset: [0, -10],          // 偏移量
        opacity: 0.9,              // 透明度
        className: 'custom-tooltip' // 自定义类名
      }, options.tooltipOptions || {});

      marker.bindTooltip(tooltipContent, tooltipOptions);
    }

    return marker;
  },

  /**
   * 添加单个IconMarker
   * @param {Array} point - 点位坐标 [lat, lng]
   * @param {Object} options - 图标配置选项
   * @param {String|HTMLElement|Function} options.tooltip - 自定义tooltip内容，支持HTML字符串、DOM元素或返回内容的函数
   * @param {Object} options.tooltipOptions - tooltip配置选项
   * @param {Boolean} options.locate - 是否定位到图标位置，默认false
   * @param {Object} options.locateOptions - 定位选项
   * @param {Number} options.locateOptions.zoom - 定位时的缩放级别，默认16
   * @param {Boolean} options.locateOptions.animate - 是否使用动画，默认false
   * @param {Number} options.locateOptions.duration - 动画持续时间（秒），默认1
   * @returns {String} IconMarker的ID
   */
  addIconMarker: function(point, options = {}) {
    const markerId = this._generateUUID();
    const marker = this._createIconMarker(point, options);
    marker.addTo(this.map);
    
    this.iconMarkerLayers.set(markerId, {
      marker: marker,
      point: point,
      options: options
    });

    // 如果需要定位到图标位置
    if (options.locate) {
      const defaultLocateOptions = {
        zoom: 16,
        animate: false,
        duration: 1
      };
      
      const locateOptions = L.extend({}, defaultLocateOptions, options.locateOptions || {});
      
      // 设置地图视图
      this.map.setView(point, locateOptions.zoom, {
        animate: locateOptions.animate,
        duration: locateOptions.duration
      });
    }
    
    return markerId;
  },

  /**
   * 批量添加IconMarker
   * @param {Array} points - 点位坐标数组 [[lat, lng], ...]
   * @param {Object} options - 图标配置选项
   * @param {String|HTMLElement|Function} options.tooltip - 自定义tooltip内容，支持HTML字符串、DOM元素或返回内容的函数
   * @param {Object} options.tooltipOptions - tooltip配置选项
   * @param {Boolean} options.locate - 是否定位到图标位置，默认false
   * @param {Object} options.locateOptions - 定位选项
   * @returns {Array} IconMarker的ID数组
   */
  addIconMarkers: function(points, options = {}) {
    const markerIds = [];
    
    // 处理tooltip选项
    const tooltipContent = options.tooltip;
    const tooltipOptions = options.tooltipOptions || {};
    
    // 为每个点创建单独的配置
    points.forEach((point, index) => {
      // 创建当前点的配置副本
      const pointOptions = L.extend({}, options);
      
      // 如果tooltip是函数，则调用函数获取当前点的tooltip内容
      if (typeof tooltipContent === 'function') {
        pointOptions.tooltip = tooltipContent(point, index);
      } else {
        pointOptions.tooltip = tooltipContent;
      }
      
      // 设置tooltip选项
      pointOptions.tooltipOptions = L.extend({}, tooltipOptions);
      
      // 单个添加时不定位，统一在最后定位
      pointOptions.locate = false;
      
      // 添加单个图标
      const markerId = this.addIconMarker(point, pointOptions);
      markerIds.push(markerId);
    });

    // 如果需要定位
    if (options.locate) {
      const defaultLocateOptions = {
        zoom: 16,
        animate: false,
        duration: 1,
        fitBounds: true,
        padding: [50, 50]
      };
      
      const locateOptions = L.extend({}, defaultLocateOptions, options.locateOptions || {});
      
      if (locateOptions.fitBounds) {
        // 计算所有图标的边界
        const bounds = L.latLngBounds(points);
        // 调整地图视图以适应所有图标
        this.map.fitBounds(bounds, {
          padding: locateOptions.padding,
          maxZoom: locateOptions.zoom,
          animate: locateOptions.animate,
          duration: locateOptions.duration
        });
      } else {
        // 如果不需要适应所有图标，则定位到最后一个图标
        const lastPoint = points[points.length - 1];
        this.map.setView(lastPoint, locateOptions.zoom, {
          animate: locateOptions.animate,
          duration: locateOptions.duration
        });
      }
    }
    
    return markerIds;
  },

  /**
   * 删除IconMarker
   * @param {String} markerId - IconMarker的ID
   * @returns {Boolean} 是否删除成功
   */
  removeIconMarker: function(markerId) {
    const markerLayer = this.iconMarkerLayers.get(markerId);
    if (!markerLayer) return false;
    
    this.map.removeLayer(markerLayer.marker);
    this.iconMarkerLayers.delete(markerId);
    
    return true;
  },

  /**
   * 删除多个IconMarker
   * @param {Array} markerIds - IconMarker的ID数组
   * @returns {Array} 成功删除的ID数组
   */
  removeIconMarkers: function(markerIds) {
    return markerIds.filter(id => this.removeIconMarker(id));
  },

  /**
   * 清除所有IconMarker
   */
  clearAllIconMarkers: function() {
    this.iconMarkerLayers.forEach((layer, id) => {
      this.removeIconMarker(id);
    });
  },

  /**
   * 添加轨迹（重写，增加IconMarker支持）
   * @param {Array} points - 轨迹点数组，每个点格式为 [lat, lng]
   * @param {Object} options - 可选的轨迹样式配置
   * @returns {String} 轨迹ID
   */
  addTrack: function(points, options = {}) {
    // 生成唯一ID
    const trackId = this._generateUUID();
    
    // 合并样式选项
    const trackStyle = L.extend({}, this.options.trackStyle, options.trackStyle || {});
    const pointStyle = L.extend({}, this.options.pointStyle, options.pointStyle || {});
    
    // 创建轨迹线
    const polyline = L.polyline(points, trackStyle).addTo(this.map);
    
    // 创建轨迹点（如果需要显示点）
    let markers = [];
    if (options.showPoints !== false) {
      markers = points.map(point => {
        return L.circleMarker(point, pointStyle).addTo(this.map);
      });
    }

    // 创建起始点IconMarker（如果启用）
    let startMarker = null;
    if (options.showStartIcon !== false && points.length > 0) {
      startMarker = this._createIconMarker(points[0], {
        iconStyle: options.startIconStyle || this.options.iconStyle,
        title: options.startIconTitle || '起点',
        popup: options.startIconPopup
      }).addTo(this.map);
    }
    
    // 存储轨迹信息
    this.tracks.set(trackId, {
      polyline: polyline,
      markers: markers,
      startMarker: startMarker,
      points: points,
      style: {
        trackStyle: trackStyle,
        pointStyle: pointStyle
      }
    });
    
    return trackId;
  },

  /**
   * 删除轨迹（重写，增加IconMarker支持）
   * @param {String} trackId - 轨迹ID
   * @returns {Boolean} 是否删除成功
   */
  removeTrack: function(trackId) {
    const track = this.tracks.get(trackId);
    if (!track) return false;
    
    // 移除轨迹线和点
    this.map.removeLayer(track.polyline);
    track.markers.forEach(marker => this.map.removeLayer(marker));
    
    // 移除起始点IconMarker
    if (track.startMarker) {
      this.map.removeLayer(track.startMarker);
    }
    
    // 从Map中删除
    this.tracks.delete(trackId);
    
    return true;
  },

  /**
   * 更新轨迹（重写，增加IconMarker支持）
   * @param {String} trackId - 轨迹ID
   * @param {Array} newPoints - 新的轨迹点数组
   * @param {Object} options - 可选的样式更新配置
   * @returns {Boolean} 是否更新成功
   */
  updateTrack: function(trackId, newPoints, options = {}) {
    const track = this.tracks.get(trackId);
    if (!track) return false;
    
    // 更新轨迹线
    track.polyline.setLatLngs(newPoints);
    
    // 更新轨迹点
    if (track.markers.length > 0) {
      // 移除旧的点
      track.markers.forEach(marker => this.map.removeLayer(marker));
      
      // 创建新的点
      const pointStyle = options.pointStyle || track.style.pointStyle;
      track.markers = newPoints.map(point => {
        return L.circleMarker(point, pointStyle).addTo(this.map);
      });
    }
    
    // 更新起始点IconMarker
    if (track.startMarker && newPoints.length > 0) {
      this.map.removeLayer(track.startMarker);
      track.startMarker = this._createIconMarker(newPoints[0], {
        iconStyle: options.startIconStyle || track.style.iconStyle,
        title: options.startIconTitle || '起点',
        popup: options.startIconPopup
      }).addTo(this.map);
    }
    
    // 更新存储的点数据
    track.points = newPoints;
    
    // 更新样式（如果提供了新的样式）
    if (options.trackStyle) {
      track.style.trackStyle = L.extend({}, track.style.trackStyle, options.trackStyle);
      track.polyline.setStyle(track.style.trackStyle);
    }
    
    return true;
  },

  /**
   * 获取轨迹信息
   * @param {String} trackId - 轨迹ID
   * @returns {Object|null} 轨迹信息对象
   */
  getTrack: function(trackId) {
    const track = this.tracks.get(trackId);
    if (!track) return null;
    
    return {
      id: trackId,
      points: track.points,
      style: track.style
    };
  },

  /**
   * 获取所有轨迹ID
   * @returns {Array} 轨迹ID数组
   */
  getAllTrackIds: function() {
    return Array.from(this.tracks.keys());
  },

  /**
   * 清除所有轨迹和IconMarker
   */
  clearAll: function() {
    // 清除所有轨迹
    this.tracks.forEach((track, trackId) => {
      this.removeTrack(trackId);
    });
    
    // 清除所有独立的IconMarker
    this.clearAllIconMarkers();
  },

  /**
   * 添加样式
   */
  addStyles: function() {
    if (document.getElementById('leaflet-track-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'leaflet-track-styles';
    style.innerHTML = `
      .leaflet-track-point {
        cursor: pointer;
      }
      
      .leaflet-track-point:hover {
        opacity: 0.8;
      }

      .custom-tooltip {
        background-color: rgba(255, 255, 255, 0.9);
        border: 1px solid #ccc;
        border-radius: 4px;
        padding: 8px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        font-size: 12px;
        line-height: 1.4;
        max-width: 200px;
      }

      .custom-tooltip:before {
        content: '';
        position: absolute;
        bottom: -6px;
        left: 50%;
        margin-left: -6px;
        border-width: 6px 6px 0;
        border-style: solid;
        border-color: #ccc transparent transparent;
      }
    `;
    
    document.head.appendChild(style);
  },

  /**
   * 向轨迹末尾追加轨迹点（重写，增加IconMarker支持）
   * @param {String} trackId - 轨迹ID
   * @param {Array} appendPoints - 要追加的轨迹点数组
   * @param {Object} options - 可选的样式更新配置
   * @returns {Boolean} 是否追加成功
   */
  appendTrackPoints: function(trackId, appendPoints, options = {}) {
    const track = this.tracks.get(trackId);
    if (!track) return false;
    
    // 合并原有轨迹点和新增轨迹点
    const newPoints = [...track.points, ...appendPoints];
    
    // 更新轨迹线
    track.polyline.setLatLngs(newPoints);
    
    // 更新轨迹点（如果显示轨迹点）
    if (track.markers.length > 0) {
      // 只为新增的点创建标记
      const pointStyle = options.pointStyle || track.style.pointStyle;
      const newMarkers = appendPoints.map(point => {
        return L.circleMarker(point, pointStyle).addTo(this.map);
      });
      
      // 将新标记添加到现有标记数组
      track.markers = [...track.markers, ...newMarkers];
    }
    
    // 更新起始点IconMarker（如果之前没有）
    if (!track.startMarker && track.startMarker !== false && newPoints.length > 0) {
      track.startMarker = this._createIconMarker(newPoints[0], {
        iconStyle: options.startIconStyle || this.options.iconStyle,
        title: options.startIconTitle || '起点',
        popup: options.startIconPopup
      }).addTo(this.map);
    }
    
    // 更新存储的点数据
    track.points = newPoints;
    
    // 更新样式（如果提供了新的样式）
    if (options.trackStyle) {
      track.style.trackStyle = L.extend({}, track.style.trackStyle, options.trackStyle);
      track.polyline.setStyle(track.style.trackStyle);
    }
    
    return true;
  },

  /**
   * 定位到指定轨迹
   * @param {String} trackId - 轨迹ID
   * @param {Object} options - 定位选项
   * @param {Number} options.padding - 视图边距（像素），默认50
   * @param {Number} options.maxZoom - 最大缩放级别，默认18
   * @returns {Boolean} 是否定位成功
   */
  locateTrack: function(trackId, options = {}) {
    const track = this.tracks.get(trackId);
    if (!track) return false;

    // 获取轨迹的边界
    const bounds = L.latLngBounds(track.points);
    
    // 设置默认选项
    const defaultOptions = {
      padding: [50, 50],  // 上下左右边距
      maxZoom: 18,        // 最大缩放级别
      animate: false,      // 使用动画
      duration: 1         // 动画持续时间（秒）
    };
    
    // 合并选项
    const fitOptions = L.extend({}, defaultOptions, options);
    
    // 调整地图视图
    this.map.fitBounds(bounds, fitOptions);
    
    return true;
  }
});

// 工厂函数
L.trackMarkerDrawer = function(map, options) {
  return new L.TrackMarkerDrawer(map, options);
}; 