const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Quản lý danh sách thiết bị theo device_id (MAC Address)
const devices = {};

// Khởi tạo thiết bị nếu chưa có trong bộ nhớ
function getOrCreateDevice(deviceId) {
    if (!devices[deviceId]) {
        devices[deviceId] = {
            secretKey: "", // Sẽ được cập nhật khi ESP8266 gửi sync lần đầu
            name: `Thiết bị ${deviceId.slice(-5)}`,
            data: {
                type: "NONE",
                d1: "N/A", d2: "N/A", d3: "N/A", d4: "N/A",
                tag: "", value: ""
            },
            commands: {
                co_kiem: 0,
                co_axit: 0,
                co_tinhkhiet: 0,
                co_onoff: 0,
                co_volume: 0
            },
            lastSeen: Date.now()
        };
    }
    return devices[deviceId];
}

// ==========================================
// --- API DÀNH CHO APP INVENTOR / WEB ---
// ==========================================

// 1. App lấy dữ liệu hiển thị (BẮT BUỘC TRUYỀN: ?device_id=...&secret_key=...)
app.get('/api/getdata', (req, res) => {
    const { device_id, secret_key } = req.query;

    if (!device_id || !devices[device_id]) {
        return res.status(404).json({ status: "ERROR", message: "Thiết bị không tồn tại" });
    }

    const device = devices[device_id];

    // XÁC THỰC MÃ PIN
    if (!secret_key || device.secretKey !== secret_key) {
        return res.status(403).json({ status: "ERROR", message: "Mã PIN không chính xác!" });
    }

    res.json({
        name: device.name,
        ...device.data
    });
});

// 2. App gửi lệnh điều khiển (BẮT BUỘC TRUYỀN trong body: device_id, secret_key, cmd)
app.post('/api/control', (req, res) => {
    const { device_id, secret_key, cmd } = req.body;

    if (!device_id || !devices[device_id]) {
        return res.status(404).json({ status: "ERROR", message: "Thiết bị không tồn tại" });
    }

    const device = devices[device_id];

    // XÁC THỰC MÃ PIN
    if (!secret_key || device.secretKey !== secret_key) {
        return res.status(403).json({ status: "ERROR", message: "Mã PIN không chính xác!" });
    }

    if (cmd && device.commands.hasOwnProperty(`co_${cmd}`)) {
        device.commands[`co_${cmd}`] = 1;
        return res.json({ status: "OK", message: `Đã ghi nhận lệnh ${cmd}` });
    }

    res.status(400).json({ status: "ERROR", message: "Lệnh không hợp lệ" });
});

// 3. Đổi tên gợi nhớ cho thiết bị
app.post('/api/device/rename', (req, res) => {
    const { device_id, secret_key, name } = req.body;

    if (!device_id || !devices[device_id]) {
        return res.status(404).json({ status: "ERROR", message: "Thiết bị không tồn tại" });
    }

    const device = devices[device_id];

    // XÁC THỰC MÃ PIN
    if (!secret_key || device.secretKey !== secret_key) {
        return res.status(403).json({ status: "ERROR", message: "Mã PIN không chính xác!" });
    }

    if (name) {
        device.name = name;
        return res.json({ status: "OK", message: `Đã đổi tên thành: ${name}` });
    }

    res.status(400).json({ status: "ERROR", message: "Tên không hợp lệ" });
});

// ==========================================
// --- API DÀNH CHO ESP8266 ---
// ==========================================

app.post('/api/esp-sync', (req, res) => {
    const { device_id, secret_key, type } = req.body;

    if (!device_id || !secret_key) {
        return res.status(400).json({ status: "ERROR", message: "Thiếu device_id hoặc secret_key từ ESP" });
    }

    const device = getOrCreateDevice(device_id);
    
    // Cập nhật Secret Key mới nhất từ ESP và thời gian hoạt động
    device.secretKey = secret_key;
    device.lastSeen = Date.now();

    // Lọc và lưu dữ liệu cảm biến
    if (type) {
        if (type === "MULTI") {
            if (req.body.d1 && !req.body.d1.includes(':')) {
                device.data = {
                    type: type,
                    d1: req.body.d1, d2: req.body.d2,
                    d3: req.body.d3, d4: req.body.d4
                };
            }
        } else {
            device.data = {
                type: type,
                tag: req.body.tag || "",
                value: req.body.value || ""
            };
        }
    }

    // Trả về lệnh chờ riêng của thiết bị này
    res.json(device.commands);

    // Reset lệnh sau khi đã trả về cho ESP
    for (let key in device.commands) {
        device.commands[key] = 0;
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
