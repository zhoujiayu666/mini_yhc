// utils/ble.js
/**
 * 蓝牙BLE通信工具类
 */
const protocol = require('./protocol.js');

class BLEController {
  constructor() {
    this.deviceId = null;
    this.serviceId = protocol.BLE_SERVICE_ID;
    this.characteristicId = protocol.BLE_CHARACTERISTIC_ID;
    this.isConnected = false;
    this.frameSeq = 0;
    this.reconnectTimer = null;
    this.reconnectCount = 0;
    this.maxReconnectAttempts = 60; // 1分钟，每秒一次
    this.mtu = 20; // 默认MTU
    this.writeType = 'write'; // 默认使用write
    this.onConnectionStateChange = null;
  }

  /**
   * 初始化蓝牙适配器
   */
  async initBluetoothAdapter() {
    return new Promise((resolve, reject) => {
      wx.openBluetoothAdapter({
        success: (res) => {
          console.log('蓝牙适配器初始化成功', res);
          resolve(res);
        },
        fail: (err) => {
          console.error('蓝牙适配器初始化失败', err);
          reject(err);
        }
      });
    });
  }

  /**
   * 开始搜索设备
   */
  startBluetoothDevicesDiscovery() {
    return new Promise((resolve, reject) => {
      wx.startBluetoothDevicesDiscovery({
        allowDuplicatesKey: false,
        success: (res) => {
          console.log('开始搜索设备', res);
          resolve(res);
        },
        fail: (err) => {
          console.error('搜索设备失败', err);
          reject(err);
        }
      });
    });
  }

  /**
   * 停止搜索设备
   */
  stopBluetoothDevicesDiscovery() {
    return new Promise((resolve, reject) => {
      wx.stopBluetoothDevicesDiscovery({
        success: (res) => {
          console.log('停止搜索设备', res);
          resolve(res);
        },
        fail: (err) => {
          console.error('停止搜索失败', err);
          reject(err);
        }
      });
    });
  }

  /**
   * 获取已发现的设备列表
   * @param {Boolean} filterByMacPrefix 是否过滤MAC地址前缀，默认true（只返回符合MAC前缀的设备）
   */
  getBluetoothDevices(filterByMacPrefix = true) {
    return new Promise((resolve, reject) => {
      wx.getBluetoothDevices({
        success: (res) => {
          let devices = res.devices || [];
          
          // 默认过滤MAC地址前缀为84:AA:A4的设备
          if (filterByMacPrefix) {
            devices = devices.filter(device => {
              const deviceId = (device.deviceId || '').toUpperCase();
              return deviceId.startsWith('84:AA:A4');
            });
          }
          
          // 按RSSI降序排列（信号越强，绝对值越小，排前面）
          devices.sort((a, b) => {
            const rssiA = a.RSSI || -100;
            const rssiB = b.RSSI || -100;
            return rssiA - rssiB; // RSSI值越小（绝对值越大），信号越强，排前面
          });
          
          console.log('设备列表（过滤MAC前缀:', filterByMacPrefix, '）:', devices);
          resolve(devices);
        },
        fail: (err) => {
          console.error('获取设备列表失败', err);
          reject(err);
        }
      });
    });
  }

  /**
   * 连接设备
   */
  async connectDevice(deviceId) {
    try {
      // 如果已经有连接，先断开
      if (this.deviceId && this.deviceId !== deviceId) {
        console.log('检测到已有连接，先断开旧连接');
        try {
          await this.disconnect();
          // 等待断开完成
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (err) {
          console.warn('断开旧连接失败，继续尝试连接', err);
        }
      }
      
      // 如果连接的是同一个设备且已连接，直接返回
      if (this.deviceId === deviceId && this.isConnected) {
        console.log('设备已连接');
        return true;
      }
      
      // 在连接前，先尝试关闭可能存在的连接（处理status:255问题）
      if (this.deviceId === deviceId || !this.deviceId) {
        try {
          console.log('连接前尝试关闭可能存在的连接');
          await new Promise((resolve) => {
            wx.closeBLEConnection({
              deviceId: deviceId,
              success: () => {
                console.log('已关闭可能存在的连接');
                resolve();
              },
              fail: () => {
                // 关闭失败不影响后续连接
                console.log('关闭连接失败（可能本来就没有连接）');
                resolve();
              }
            });
          });
          // 等待设备状态清理
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (err) {
          console.warn('关闭连接时出错，继续尝试连接', err);
        }
      }
      
      this.deviceId = deviceId;
      
      // 创建BLE连接（添加超时和重试）
      await this.createBLEConnectionWithRetry();
      
      // 获取服务
      const services = await this.getBLEDeviceServices();
      const service = services.find(s => s.uuid === this.serviceId);
      if (!service) {
        throw new Error('未找到指定服务');
      }
      
      // 获取特征值
      const characteristics = await this.getBLEDeviceCharacteristics(service.uuid);
      const characteristic = characteristics.find(c => c.uuid === this.characteristicId);
      if (!characteristic) {
        throw new Error('未找到指定特征值');
      }
      
      // 判断是否支持WriteNoResponse
      if (characteristic.properties.writeNoResponse) {
        this.writeType = 'writeNoResponse';
      } else {
        this.writeType = 'write';
      }
      
      // 设置MTU为64字节
      await this.setBLEMTU(64);
      
      // 启用特征值通知（如果需要）
      if (characteristic.properties.notify || characteristic.properties.indicate) {
        await this.notifyBLECharacteristicValueChange(service.uuid, characteristic.uuid, true);
      }
      
      this.isConnected = true;
      this.reconnectCount = 0;
      
      if (this.onConnectionStateChange) {
        this.onConnectionStateChange(true);
      }
      
      // 监听连接断开
      wx.onBLEConnectionStateChange((res) => {
        console.log('BLE连接状态变化', res);
        if (!res.connected) {
          this.isConnected = false;
          if (this.onConnectionStateChange) {
            this.onConnectionStateChange(false);
          }
          this.startReconnect();
        }
      });
      
      return true;
    } catch (error) {
      console.error('连接设备失败', error);
      this.isConnected = false;
      
      // 提供更友好的错误提示
      let errorMsg = '连接失败';
      if (error.errCode === 10003) {
        // 提取status码
        const statusMatch = error.errMsg && error.errMsg.match(/status:(\d+)/);
        const status = statusMatch ? parseInt(statusMatch[1]) : null;
        
        if (status === 255) {
          errorMsg = '连接失败：设备连接状态异常，可能已被占用';
        } else if (status === 8) {
          errorMsg = '连接失败：设备正在连接中，请稍后重试';
        } else if (status === 7) {
          errorMsg = '连接失败：设备已连接，请先断开后重试';
        } else if (status === 6) {
          errorMsg = '连接失败：设备未找到，请重新搜索';
        } else if (status === 2) {
          errorMsg = '连接失败：连接超时，请确保设备已开启';
        } else if (status !== null) {
          errorMsg = `连接失败：设备状态异常（status:${status}）`;
        } else {
          errorMsg = '连接失败：请确保设备已开启且距离较近';
        }
      }
      error.userMessage = errorMsg;
      throw error;
    }
  }

  /**
   * 创建BLE连接（带重试机制）
   */
  createBLEConnectionWithRetry(maxRetries = 2) {
    return new Promise(async (resolve, reject) => {
      for (let i = 0; i <= maxRetries; i++) {
        try {
          if (i > 0) {
            console.log(`第 ${i} 次重试连接...`);
            // 等待一段时间后重试
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
          await this.createBLEConnection();
          resolve();
          return;
        } catch (err) {
          if (i === maxRetries) {
            reject(err);
          } else {
            console.warn(`连接失败，准备重试 (${i + 1}/${maxRetries})`, err);
          }
        }
      }
    });
  }

  /**
   * 创建BLE连接
   */
  createBLEConnection(closeAndRetry = false) {
    return new Promise((resolve, reject) => {
      // 如果已经尝试过关闭重连，直接拒绝，让外层重试机制处理
      if (closeAndRetry) {
        // 添加超时处理
        const timeout = setTimeout(() => {
          reject({
            errCode: 10003,
            errMsg: '连接超时，请重试'
          });
        }, 10000); // 10秒超时
        
        wx.createBLEConnection({
          deviceId: this.deviceId,
          timeout: 10000, // 10秒超时
          success: (res) => {
            clearTimeout(timeout);
            console.log('BLE连接成功（关闭重连后）', res);
            resolve(res);
          },
          fail: (err) => {
            clearTimeout(timeout);
            console.error('BLE连接失败（关闭重连后）', err);
            reject(err);
          }
        });
        return;
      }
      
      // 添加超时处理
      const timeout = setTimeout(() => {
        reject({
          errCode: 10003,
          errMsg: '连接超时，请重试'
        });
      }, 10000); // 10秒超时
      
      wx.createBLEConnection({
        deviceId: this.deviceId,
        timeout: 10000, // 10秒超时
        success: (res) => {
          clearTimeout(timeout);
          console.log('BLE连接成功', res);
          resolve(res);
        },
        fail: (err) => {
          clearTimeout(timeout);
          console.error('BLE连接失败', err);
          
          // 提取status码
          const statusMatch = err.errMsg && err.errMsg.match(/status:(\d+)/);
          const status = statusMatch ? parseInt(statusMatch[1]) : null;
          
          // 处理不同的status错误
          if (err.errCode === 10003 && status !== null) {
            if (status === 255) {
              // status:255 - 连接状态异常，尝试关闭连接后重试
              console.log('检测到status:255错误（连接状态异常），尝试关闭连接');
              wx.closeBLEConnection({
                deviceId: this.deviceId,
                success: () => {
                  console.log('已关闭旧连接，等待1.5秒后重试');
                  setTimeout(() => {
                    this.createBLEConnection(true)
                      .then(resolve)
                      .catch(reject);
                  }, 1500);
                },
                fail: (closeErr) => {
                  console.warn('关闭连接失败，等待1.5秒后重试', closeErr);
                  setTimeout(() => {
                    this.createBLEConnection(true)
                      .then(resolve)
                      .catch(reject);
                  }, 1500);
                }
              });
              return;
            } else if (status === 8) {
              // status:8 - 设备连接中，等待更长时间后重试
              console.log('检测到status:8错误（设备连接中），等待2秒后重试');
              setTimeout(() => {
                this.createBLEConnection(true)
                  .then(resolve)
                  .catch(reject);
              }, 2000); // 等待2秒，让设备完成当前连接
              return;
            } else if (status === 7) {
              // status:7 - 设备已连接，尝试关闭后重连
              console.log('检测到status:7错误（设备已连接），尝试关闭连接');
              wx.closeBLEConnection({
                deviceId: this.deviceId,
                success: () => {
                  console.log('已关闭已存在的连接，等待1秒后重试');
                  setTimeout(() => {
                    this.createBLEConnection(true)
                      .then(resolve)
                      .catch(reject);
                  }, 1000);
                },
                fail: () => {
                  setTimeout(() => {
                    this.createBLEConnection(true)
                      .then(resolve)
                      .catch(reject);
                  }, 1000);
                }
              });
              return;
            }
          }
          
          // 其他错误直接拒绝
          reject(err);
        }
      });
    });
  }

  /**
   * 获取BLE设备服务
   */
  getBLEDeviceServices() {
    return new Promise((resolve, reject) => {
      wx.getBLEDeviceServices({
        deviceId: this.deviceId,
        success: (res) => {
          console.log('获取服务成功', res);
          resolve(res.services);
        },
        fail: (err) => {
          console.error('获取服务失败', err);
          reject(err);
        }
      });
    });
  }

  /**
   * 获取BLE设备特征值
   */
  getBLEDeviceCharacteristics(serviceId) {
    return new Promise((resolve, reject) => {
      wx.getBLEDeviceCharacteristics({
        deviceId: this.deviceId,
        serviceId: serviceId,
        success: (res) => {
          console.log('获取特征值成功', res);
          resolve(res.characteristics);
        },
        fail: (err) => {
          console.error('获取特征值失败', err);
          reject(err);
        }
      });
    });
  }

  /**
   * 设置BLE MTU
   */
  setBLEMTU(mtu) {
    return new Promise((resolve, reject) => {
      wx.setBLEMTU({
        deviceId: this.deviceId,
        mtu: mtu,
        success: (res) => {
          console.log('设置MTU成功', res);
          this.mtu = res.mtu || mtu;
          resolve(res);
        },
        fail: (err) => {
          console.warn('设置MTU失败（部分设备不支持）', err);
          // MTU设置失败不影响使用，使用默认值
          resolve({ mtu: 20 });
        }
      });
    });
  }

  /**
   * 启用/禁用特征值通知
   */
  notifyBLECharacteristicValueChange(serviceId, characteristicId, state) {
    return new Promise((resolve, reject) => {
      if (state) {
        wx.notifyBLECharacteristicValueChange({
          deviceId: this.deviceId,
          serviceId: serviceId,
          characteristicId: characteristicId,
          state: true,
          success: (res) => {
            console.log('启用通知成功', res);
            resolve(res);
          },
          fail: (err) => {
            console.error('启用通知失败', err);
            reject(err);
          }
        });
      } else {
        wx.notifyBLECharacteristicValueChange({
          deviceId: this.deviceId,
          serviceId: serviceId,
          characteristicId: characteristicId,
          state: false,
          success: (res) => {
            console.log('禁用通知成功', res);
            resolve(res);
          },
          fail: (err) => {
            console.error('禁用通知失败', err);
            reject(err);
          }
        });
      }
    });
  }

  /**
   * 写入数据到设备
   */
  writeBLECharacteristicValue(buffer, useWriteNoResponse = false) {
    if (!this.isConnected || !this.deviceId) {
      const error = new Error('设备未连接，无法发送数据');
      console.error('❌ 写入数据失败:', error.message);
      return Promise.reject(error);
    }

    // 确保buffer是ArrayBuffer格式
    let arrayBuffer;
    if (buffer instanceof ArrayBuffer) {
      arrayBuffer = buffer;
    } else if (buffer instanceof Uint8Array) {
      // Uint8Array转ArrayBuffer：创建新的ArrayBuffer，只包含Uint8Array的数据
      arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    } else {
      const error = new Error('数据格式错误，需要ArrayBuffer或Uint8Array');
      console.error('❌ 写入数据失败:', error.message, buffer);
      return Promise.reject(error);
    }

    // 检查数据长度
    const dataLength = arrayBuffer.byteLength;
    if (dataLength > this.mtu) {
      console.warn(`⚠️ 数据长度(${dataLength})超过MTU(${this.mtu})，可能被截断`);
    }

    const writeType = (useWriteNoResponse && this.writeType === 'writeNoResponse') 
      ? 'writeNoResponse' 
      : 'write';

    console.log(`📤 准备写入数据:`, {
      写入类型: writeType,
      数据长度: dataLength,
      MTU: this.mtu,
      设备ID: this.deviceId.substring(0, 17) + '...'
    });

    return new Promise((resolve, reject) => {
      wx.writeBLECharacteristicValue({
        deviceId: this.deviceId,
        serviceId: this.serviceId,
        characteristicId: this.characteristicId,
        value: arrayBuffer,
        writeType: writeType,
        success: (res) => {
          console.log('✅ 写入数据成功:', {
            写入类型: writeType,
            数据长度: dataLength
          });
          resolve(res);
        },
        fail: (err) => {
          console.error('❌ 写入数据失败:', {
            错误码: err.errCode,
            错误信息: err.errMsg,
            写入类型: writeType,
            数据长度: dataLength,
            MTU: this.mtu,
            设备ID: this.deviceId
          });
          
          // 如果WriteNoResponse失败，尝试使用Write
          if (writeType === 'writeNoResponse' && err.errCode === 10004) {
            console.log('🔄 WriteNoResponse失败，尝试使用Write模式');
            return this.writeBLECharacteristicValue(buffer, false)
              .then(resolve)
              .catch(reject);
          }
          
          // 如果是特征值不支持写入，提示用户
          if (err.errCode === 10004) {
            console.error('❌ 特征值不支持写入操作');
          } else if (err.errCode === 10012) {
            console.error('❌ 连接已断开');
            this.isConnected = false;
            if (this.onConnectionStateChange) {
              this.onConnectionStateChange(false);
            }
          }
          
          reject(err);
        }
      });
    });
  }

  /**
   * 发送数据帧
   */
  async sendFrame(frame, useWriteNoResponse = true) {
    try {
      if (!frame || (!(frame instanceof ArrayBuffer) && !(frame instanceof Uint8Array))) {
        throw new Error('数据帧格式错误，需要ArrayBuffer或Uint8Array');
      }
      
      // 确保是ArrayBuffer格式（微信小程序要求）
      let arrayBuffer;
      if (frame instanceof ArrayBuffer) {
        arrayBuffer = frame;
      } else if (frame instanceof Uint8Array) {
        arrayBuffer = frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength);
      }
      
      // 更新帧序号（在数据帧的前4字节）
      this.frameSeq = (this.frameSeq + 1) % 0xFFFFFFFF;
      const view = new DataView(arrayBuffer);
      const oldFrameSeq = view.getUint32(0, true); // 读取旧的帧序号（小端模式）
      view.setUint32(0, this.frameSeq, true); // 设置新的帧序号（小端模式）
      
      // 重新计算CRC（因为帧序号改变了）
      const uint8Array = new Uint8Array(arrayBuffer);
      // CRC是最后4字节，需要重新计算前面的数据（不包括CRC本身）
      const dataWithoutCRC = uint8Array.slice(0, uint8Array.length - 4);
      // 使用已导入的protocol模块
      const newCRC = protocol.calculateCRC32(dataWithoutCRC);
      
      // 更新CRC（最后4字节，小端模式）
      view.setUint32(arrayBuffer.byteLength - 4, newCRC, true);
      
      // 调试日志
      const hexString = Array.from(uint8Array).map(b => b.toString(16).padStart(2, '0')).join(' ');
      console.log(`📡 发送数据帧:`, {
        旧帧序号: `0x${oldFrameSeq.toString(16).padStart(8, '0')}`,
        新帧序号: `0x${this.frameSeq.toString(16).padStart(8, '0')}`,
        数据长度: arrayBuffer.byteLength,
        使用WriteNoResponse: useWriteNoResponse,
        新CRC: `0x${newCRC.toString(16).padStart(8, '0')}`,
        十六进制: hexString
      });
      
      await this.writeBLECharacteristicValue(arrayBuffer, useWriteNoResponse);
      return true;
    } catch (error) {
      console.error('❌ 发送数据帧失败:', error);
      throw error;
    }
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.deviceId) {
      wx.closeBLEConnection({
        deviceId: this.deviceId,
        success: () => {
          console.log('断开连接成功');
          this.isConnected = false;
          this.deviceId = null;
          if (this.onConnectionStateChange) {
            this.onConnectionStateChange(false);
          }
        },
        fail: (err) => {
          console.error('断开连接失败', err);
        }
      });
    }
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * 开始重连
   */
  startReconnect() {
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectCount = 0;
    const attemptReconnect = async () => {
      if (this.reconnectCount >= this.maxReconnectAttempts) {
        console.log('重连次数已达上限，停止重连');
        this.reconnectTimer = null;
        return;
      }

      if (this.isConnected) {
        this.reconnectTimer = null;
        return;
      }

      try {
        this.reconnectCount++;
        console.log(`尝试重连 (${this.reconnectCount}/${this.maxReconnectAttempts})`);
        
        if (this.deviceId) {
          await this.connectDevice(this.deviceId);
          this.reconnectTimer = null;
        } else {
          // 如果没有deviceId，等待1秒后重试
          this.reconnectTimer = setTimeout(attemptReconnect, 1000);
        }
      } catch (error) {
        console.error('重连失败', error);
        // 等待1秒后重试
        this.reconnectTimer = setTimeout(attemptReconnect, 1000);
      }
    };

    attemptReconnect();
  }

  /**
   * 关闭蓝牙适配器
   */
  closeBluetoothAdapter() {
    this.disconnect();
    wx.closeBluetoothAdapter({
      success: () => {
        console.log('关闭蓝牙适配器成功');
      },
      fail: (err) => {
        console.error('关闭蓝牙适配器失败', err);
      }
    });
  }
}

// 创建单例
const bleController = new BLEController();

module.exports = bleController;
