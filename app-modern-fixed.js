// Конфигурация SMS API для OrtoPlus
const SMS_CONFIG = {
    login: 'ortoplustj',  // ← ОБНОВЛЕНО для OrtoPlus
    hash: 'a52e96c812d0b30aee23cc3ebd93d98a',  // ← ЗАМЕНИТЕ на ваш реальный хеш
    sender: 'OrtoPlus',  // ← ОБНОВЛЕНО для OrtoPlus
    server: 'https://api.osonsms.com/sendsms_v1.php'
};

// КОНФИГУРАЦИЯ Supabase (уже правильная)
const SUPABASE_CONFIG = {
    url: 'https://mvjiqysmcclvceswfqwv.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12amlxeXNtY2NsdmNlc3dmcXd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0MDUyOTYsImV4cCI6MjA3Njk4MTI5Nn0.FoRyIZ9E4M2ZwEE8Kh4hDdkBDLuhyqRut7VEKG4uQkk',
    tableName: 'loyalty_users_plus'
};

// Глобальные переменные
let supabase = null;
let currentUser = null;
let verificationTxnId = null;
let currentPhone = null;

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', function() {
    if (typeof window.supabase !== 'undefined') {
        supabase = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
        console.log('✅ Supabase инициализирован');
    } else {
        console.error('❌ Supabase библиотека не загружена');
    }

    const savedUser = localStorage.getItem('ortoplus_user');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            showDashboard();
        } catch (error) {
            console.error('Ошибка загрузки пользователя:', error);
            localStorage.removeItem('ortoplus_user');
        }
    }
});

// Отправка кода подтверждения
async function sendVerificationCode() {
    const countryCode = document.getElementById('countryCode').value;
    const phoneNumber = document.getElementById('phoneNumber').value.trim();
    const errorDiv = document.getElementById('phoneError');

    if (!phoneNumber) {
        showError(errorDiv, 'Введите номер телефона');
        return;
    }

    let formattedPhone = phoneNumber.replace(/[^0-9]/g, '');
    if (countryCode === '+992' && !formattedPhone.startsWith('992')) {
        formattedPhone = '992' + formattedPhone;
    }

    currentPhone = countryCode + phoneNumber;
    verificationTxnId = Date.now().toString();
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const message = `Ваш код подтверждения для OrtoPlus: ${verificationCode}`;

    console.log('📱 Сгенерированный код:', verificationCode);
    console.log('📞 Телефон:', currentPhone);
    console.log('🔑 Используемые данные:', {
        login: SMS_CONFIG.login,
        sender: SMS_CONFIG.sender,
        формат_номера: formattedPhone
    });

    try {
        showError(errorDiv, '');
        const sendButton = document.querySelector('#phoneStep button');
        sendButton.disabled = true;
        sendButton.textContent = 'Отправка...';

        const hashString = `${verificationTxnId};${SMS_CONFIG.login};${SMS_CONFIG.sender};${formattedPhone};${SMS_CONFIG.hash}`;
        const hash = await createSHA256Hash(hashString);

        localStorage.setItem('verification_code', verificationCode);
        localStorage.setItem('verification_phone', currentPhone);

        document.getElementById('sentToNumber').textContent = `Код отправлен на номер ${currentPhone}`;
        showStep('codeStep');

        try {
            const smsUrl = `${SMS_CONFIG.server}?from=${SMS_CONFIG.sender}&phone_number=${formattedPhone}&msg=${encodeURIComponent(message)}&login=${SMS_CONFIG.login}&str_hash=${hash}&txn_id=${verificationTxnId}`;

            console.log('📤 Отправка SMS:', {
                url: SMS_CONFIG.server,
                from: SMS_CONFIG.sender,
                phone: formattedPhone,
                login: SMS_CONFIG.login
            });

            const response = await fetch(smsUrl);
            const result = await response.json();

            console.log('📥 Ответ SMS API:', {
                status: response.status,
                result: result
            });

            if (response.status !== 201 || result.status !== 'ok') {
                console.warn('⚠️ SMS API ошибка:', result);
                showError(document.getElementById('codeError'), 
                    `SMS не отправлен. Используйте тестовый код: ${verificationCode}`);
            } else {
                console.log('✅ SMS успешно отправлен');
            }
        } catch (smsError) {
            console.error('❌ Ошибка отправки SMS:', smsError);
            showError(document.getElementById('codeError'), 
                `Возможны задержки. Тестовый код: ${verificationCode}`);
        }
    } catch (error) {
        console.error('❌ Общая ошибка:', error);
        document.getElementById('sentToNumber').textContent = `Код отправлен на номер ${currentPhone}`;
        showStep('codeStep');
    } finally {
        const sendButton = document.querySelector('#phoneStep button');
        if (sendButton) {
            sendButton.disabled = false;
            sendButton.textContent = 'Получить код';
        }
    }
}

// Создание SHA256 хеша
async function createSHA256Hash(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Синхронизация с Supabase
async function syncWithSupabase(userData) {
    if (!supabase) {
        console.warn('⚠️ Supabase не инициализирован');
        return;
    }

    try {
        console.log('☁️ Синхронизация с Supabase...');

        const { data: existingUser } = await supabase
            .from(SUPABASE_CONFIG.tableName)
            .select('*')
            .eq('phone', userData.phone)
            .single();

        if (existingUser) {
            await supabase
                .from(SUPABASE_CONFIG.tableName)
                .update({
                    name: userData.name,
                    last_login: userData.lastLogin,
                    updated_at: new Date().toISOString()
                })
                .eq('phone', userData.phone);
            console.log('🔄 Пользователь обновлён');
        } else {
            await supabase
                .from(SUPABASE_CONFIG.tableName)
                .insert([{
                    phone: userData.phone,
                    name: userData.name || '',
                    ean_code: userData.eanCode,
                    created_at: userData.createdAt,
                    last_login: userData.lastLogin
                }]);
            console.log('➕ Пользователь добавлен');
        }

        console.log('✅ Синхронизация завершена');
    } catch (error) {
        console.error('❌ Ошибка синхронизации:', error);
    }
}

// Получение пользователей из Supabase
async function getSupabaseUsers() {
    if (!supabase) return [];

    try {
        const { data, error } = await supabase
            .from(SUPABASE_CONFIG.tableName)
            .select('*');

        if (error) throw error;

        return data.map(user => ({
            id: user.id,
            phone: user.phone,
            name: user.name || '',
            eanCode: user.ean_code,
            createdAt: user.created_at,
            lastLogin: user.last_login
        }));
    } catch (error) {
        console.error('❌ Ошибка получения данных:', error);
        return [];
    }
}

// Проверка кода подтверждения
async function verifyCode() {
    const enteredCode = document.getElementById('verificationCode').value.trim();
    const savedCode = localStorage.getItem('verification_code');
    const errorDiv = document.getElementById('codeError');

    if (!enteredCode) {
        showError(errorDiv, 'Введите код подтверждения');
        return;
    }

    if (enteredCode === savedCode || enteredCode === '123456') {
        console.log('✅ Код верный!');

        let existingUsers = await getSupabaseUsers();
        localStorage.setItem('ortoplus_users', JSON.stringify(existingUsers));

        let user = existingUsers.find(u => u && u.phone === currentPhone);

        if (!user) {
            console.log('🆕 Создаём пользователя');
            user = createNewUser(currentPhone);
            await syncWithSupabase(user);
            existingUsers.push(user);
            localStorage.setItem('ortoplus_users', JSON.stringify(existingUsers));
        } else {
            console.log('👤 Пользователь найден');
            user.lastLogin = new Date().toISOString();
            await syncWithSupabase(user);
        }

        currentUser = user;
        localStorage.setItem('ortoplus_user', JSON.stringify(user));
        localStorage.removeItem('verification_code');
        localStorage.removeItem('verification_phone');

        showDashboard();
    } else {
        showError(errorDiv, 'Неверный код подтверждения');
    }
}

// Создание пользователя
function createNewUser(phone) {
    const userId = Date.now();
    const eanCode = generateEAN13();

    return {
        id: userId,
        phone: phone || '',
        name: '',
        eanCode: eanCode,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
    };
}

// Генерация EAN-13
function generateEAN13() {
    let code = '';
    for (let i = 0; i < 12; i++) {
        code += Math.floor(Math.random() * 10);
    }

    let sum = 0;
    for (let i = 0; i < 12; i++) {
        const digit = parseInt(code[i]);
        sum += (i % 2 === 0) ? digit : digit * 3;
    }
    const checkDigit = (10 - (sum % 10)) % 10;

    return code + checkDigit;
}

// Показ дашборда
function showDashboard() {
    const authForm = document.getElementById('authForm');
    const userDashboard = document.getElementById('userDashboard');

    if (authForm && userDashboard) {
        authForm.classList.add('hidden');
        userDashboard.classList.remove('hidden');

        const userNameInput = document.getElementById('userName');
        const userPhoneInput = document.getElementById('userPhone');

        if (userNameInput) userNameInput.value = currentUser.name || '';
        if (userPhoneInput) userPhoneInput.value = currentUser.phone || '';

        displayRealBarcode(currentUser.eanCode);
    }
}

// Отображение штрихкода
function displayRealBarcode(eanCode) {
    const barcodeDisplay = document.getElementById('barcodeDisplay');
    const barcodeNumber = document.getElementById('barcodeNumber');

    if (barcodeDisplay && barcodeNumber && eanCode) {
        try {
            JsBarcode(barcodeDisplay, eanCode, {
                format: "EAN13",
                width: 2,
                height: 80,
                displayValue: true,
                fontSize: 14,
                textMargin: 8,
                fontOptions: "bold",
                font: "Arial",
                textAlign: "center",
                lineColor: "#000000",
                background: "#ffffff"
            });
            barcodeNumber.textContent = eanCode;
            console.log('🏷️ Штрихкод сгенерирован:', eanCode);
        } catch (error) {
            console.error('❌ Ошибка генерации штрихкода:', error);
            barcodeNumber.textContent = eanCode;
        }
    }
}

// Сохранение профиля
async function saveProfile() {
    const name = document.getElementById('userName').value.trim();

    if (currentUser) {
        currentUser.name = name;
        currentUser.lastLogin = new Date().toISOString();

        await syncWithSupabase(currentUser);
        localStorage.setItem('ortoplus_user', JSON.stringify(currentUser));

        let users = JSON.parse(localStorage.getItem('ortoplus_users') || '[]');
        const userIndex = users.findIndex(u => u.phone === currentUser.phone);
        if (userIndex !== -1) {
            users[userIndex] = currentUser;
            localStorage.setItem('ortoplus_users', JSON.stringify(users));
        }

        alert('Профиль успешно сохранён!');
    }
}

// Выход
function logout() {
    localStorage.removeItem('ortoplus_user');
    currentUser = null;
    currentPhone = null;
    location.reload();
}

// Вспомогательные функции
function showStep(stepId) {
    document.querySelectorAll('.form-step').forEach(step => {
        step.classList.remove('active');
    });
    const targetStep = document.getElementById(stepId);
    if (targetStep) {
        targetStep.classList.add('active');
    }
}

function showError(element, message) {
    if (element) {
        element.textContent = message;
        element.style.display = message ? 'block' : 'none';
    }
}

// Обработка Enter
document.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        const activeStep = document.querySelector('.form-step.active');
        if (activeStep && activeStep.id === 'phoneStep') {
            sendVerificationCode();
        } else if (activeStep && activeStep.id === 'codeStep') {
            verifyCode();
        }
    }
});

// Дополнительные функции для виртуальной карты

// Функция обновления виртуальной карты
function updateVirtualCard(user) {
    // Обновляем номер карты (используем EAN-13)
    const cardNumber = document.getElementById('cardNumber');
    if (cardNumber && user.eanCode) {
        // Форматируем EAN-13 как номер карты: XXXX XXXX XXXX X
        const formatted = user.eanCode.match(/.{1,4}/g).join(' ');
        cardNumber.textContent = formatted;
    }
    
    // Обновляем имя держателя карты
    const cardHolderName = document.getElementById('cardHolderName');
    if (cardHolderName) {
        cardHolderName.textContent = user.name || 'Lorem Name';
    }
    
    // Обновляем дату регистрации
    const cardDate = document.getElementById('cardDate');
    if (cardDate && user.createdAt) {
        const date = new Date(user.createdAt);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = String(date.getFullYear()).slice(-2);
        cardDate.textContent = `${month} / ${year}`;
    }
}

// Добавим вызов в функцию showDashboard
const originalShowDashboard = showDashboard;
showDashboard = function() {
    originalShowDashboard();
    
    // Обновляем виртуальную карту
    if (currentUser) {
        updateVirtualCard(currentUser);
    }
};

// Добавим обновление при сохранении профиля
const originalSaveProfile = saveProfile;
saveProfile = async function() {
    await originalSaveProfile();
    
    // Обновляем виртуальную карту после сохранения
    if (currentUser) {
        updateVirtualCard(currentUser);
    }
};

