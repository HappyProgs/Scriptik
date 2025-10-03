// https://raw.githubusercontent.com/HappyProgs/Scriptik/main/Api.js
// Этот файл будет хранить данные в формате JSON

const API_DATA = {
    version: "1.0.0",
    lastUpdate: "2024-01-15",
    users: [],
    statistics: {
        totalLaunches: 0,
        uniqueUsers: 0,
        lastLaunch: null
    },
    settings: {
        enableLogging: true,
        autoUpdate: true,
        securityLevel: "high"
    }
};

// Функция для добавления данных о запуске
function addLaunchData(userData) {
    if (!userData || !userData.userName) return;
    
    // Обновляем статистику
    API_DATA.statistics.totalLaunches++;
    API_DATA.statistics.lastLaunch = new Date().toISOString();
    
    // Добавляем/обновляем пользователя
    const existingUser = API_DATA.users.find(u => u.userName === userData.userName);
    if (existingUser) {
        existingUser.lastLaunch = new Date().toISOString();
        existingUser.launchCount++;
        existingUser.lastIp = userData.ip || existingUser.lastIp;
        existingUser.machineName = userData.machineName || existingUser.machineName;
    } else {
        API_DATA.users.push({
            userName: userData.userName,
            machineName: userData.machineName,
            ip: userData.ip,
            firstLaunch: new Date().toISOString(),
            lastLaunch: new Date().toISOString(),
            launchCount: 1,
            os: userData.os
        });
        API_DATA.statistics.uniqueUsers++;
    }
    
    return API_DATA;
}

// Функция для получения статистики
function getStatistics() {
    return API_DATA.statistics;
}

// Функция для получения всех пользователей
function getAllUsers() {
    return API_DATA.users;
}

// Экспорт для использования в других скриптах
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        API_DATA,
        addLaunchData,
        getStatistics,
        getAllUsers
    };
}
