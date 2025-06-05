// vputi-backend/server.js

// 1. Подключение модулей
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const querystring = require('querystring'); 

// 2. Инициализация Express приложения
const app = express();
const PORT = process.env.PORT || 3001;

// 3. Конфигурация
const TRAVELPAYOUTS_API_TOKEN = '2db25a770b8322d049195f68fdf77f9b';
const YOUR_PARTNER_MARKER = '636492'; 
const TRS_VALUE = '422197';
// ID Программ и Кампаний
const P_VALUE_AVIASALES = '4114';     
const P_VALUE_HOTELLOOK = '4115';
const CAMPAIGN_ID_AVIASALES = '100';
const CAMPAIGN_ID_HOTELLOOK = '101';

// 4. Логирование статуса токена при старте
console.log(
    'Статус API токена Travelpayouts (первые 5 символов):', 
    (TRAVELPAYOUTS_API_TOKEN && TRAVELPAYOUTS_API_TOKEN !== 'СЮДА_ВСТАВЬ_СВОЙ_РЕАЛЬНЫЙ_НОВЫЙ_API_ТОКЕН') 
        ? TRAVELPAYOUTS_API_TOKEN.substring(0, 5) + '...' 
        : 'ТОКЕН НЕ УСТАНОВЛЕН ИЛИ ОСТАЛСЯ ПЛЕЙСХОЛДЕР!'
);

// 5. Подключение middleware
app.use(cors()); 
app.use(express.json());

// --- Начало Маршрутов API ---

// 6. Тестовый маршрут GET /
app.get('/', (req, res) => {
    res.send('Привет! Бэкенд "ВПути.ру" запущен!');
});

// 7. Маршрут для поиска цен на авиабилеты
app.get('/api/test-flight-prices', async (req, res) => {
    if (!TRAVELPAYOUTS_API_TOKEN || TRAVELPAYOUTS_API_TOKEN === 'СЮДА_ВСТАВЬ_СВОЙ_РЕАЛЬНЫЙ_НОВЫЙ_API_ТОКЕН') {
        return res.status(500).json({ message: 'Ошибка конфигурации сервера: API токен не настроен.' });
    } 
    const { origin, destination, departure_at } = req.query;
    if (!origin || !destination || !departure_at) {
        return res.status(400).json({ message: 'Необходимы параметры origin, destination и departure_at' });
    }
    const currency = req.query.currency || 'rub';
    const limit = parseInt(req.query.limit) || 30;
    const flightPricesApiUrl = `https://api.travelpayouts.com/aviasales/v3/prices_for_dates`;
    try {
        console.log(`Запрос к Aviasales API (${flightPricesApiUrl}) по маршруту ${origin} -> ${destination} на ${departure_at}`);
        const response = await axios.get(flightPricesApiUrl, {
            params: {
                origin: origin, destination: destination, departure_at: departure_at,
                currency: currency, limit: limit,
                token: TRAVELPAYOUTS_API_TOKEN
            },
            timeout: 15000
        }); 
        console.log("Ответ от Aviasales API (цены на даты) получен успешно!");
        res.json(response.data); 
    } catch (error) {
        const errorMessage = error.response ? `Статус: ${error.response.status}, Тело ответа: ${JSON.stringify(error.response.data)}` : `Ошибка Axios: ${error.message}`;
        console.error('Ошибка при запросе к Aviasales API (цены на даты):', errorMessage);
        let clientMessage = 'Ошибка при получении цен на авиабилеты. Попробуйте позже.';
        if (error.code === 'ECONNABORTED' || (error.response && error.response.status >= 500)) {
            clientMessage = 'Сервер-партнер временно недоступен или не отвечает. Пожалуйста, попробуйте позже.';
        }
        res.status(500).json({ message: clientMessage });
    } 
});

// 8. Маршрут для генерации deeplink для авиабилетов
app.post('/api/generate-flight-deeplink', (req, res) => {
    const { aviasales_relative_link } = req.body; 
    if (!aviasales_relative_link) {
        return res.status(400).json({ message: 'Параметр "aviasales_relative_link" обязателен.' });
    }
    const targetUrl = `https://www.aviasales.ru${aviasales_relative_link}`; 
    const encodedTargetUrl = encodeURIComponent(targetUrl);
    const deeplinkParams = {
        marker: YOUR_PARTNER_MARKER,
        trs: TRS_VALUE,
        p: P_VALUE_AVIASALES,
        u: encodedTargetUrl,
        campaign_id: CAMPAIGN_ID_AVIASALES
    };
    const affiliateDeeplink = `https://tp.media/r?${querystring.stringify(deeplinkParams)}`;
    console.log('Сгенерирован Deeplink для Aviasales:', affiliateDeeplink);
    res.json({ success: true, deeplink: affiliateDeeplink });
});

// 9. Маршрут для автодополнения мест (городов/аэропортов)
app.get('/api/suggest-places-autocomplete', async (req, res) => {
    const { term, locale = 'ru' } = req.query;
    if (!TRAVELPAYOUTS_API_TOKEN || TRAVELPAYOUTS_API_TOKEN === 'СЮДА_ВСТАВЬ_СВОЙ_РЕАЛЬНЫЙ_НОВЫЙ_API_ТОКЕН') {
        return res.status(500).json({ message: 'Ошибка конфигурации сервера: API токен не настроен.' });
    }
    if (!term) {
        return res.status(400).json({ message: 'Параметр "term" (поисковый запрос) обязателен.' });
    }
    const placesApiUrl = `https://api.travelpayouts.com/data/${locale}/cities.json`;
    try {
        console.log(`Запрос к Travelpayouts Data API (СПИСОК ГОРОДОВ): ${placesApiUrl}`);
        const response = await axios.get(placesApiUrl, { params: { token: TRAVELPAYOUTS_API_TOKEN } });
        console.log("Полный список городов получен успешно! Начинаем фильтрацию...");
        const suggestions = response.data.filter(city => city.name && city.name.toLowerCase().startsWith(term.toLowerCase())).slice(0, 7);
        console.log(`Найдено ${suggestions.length} подсказок для "${term}"`);
        res.json(suggestions);
    } catch (error) {
        const errorMessage = error.response ? `Статус: ${error.response.status}, Тело ответа: ${JSON.stringify(error.response.data)}` : error.message;
        console.error('Ошибка при запросе к Travelpayouts Data API (СПИСОК ГОРОДОВ):', errorMessage);
        res.status(500).json({ message: 'Ошибка при получении списка мест от внешнего сервиса (автодополнение).' });
    }
});

// 10. НОВЫЙ МАРШРУТ для генерации deeplink для Отелей (Hotellook)
app.post('/api/generate-hotel-deeplink', (req, res) => {
    const { cityId, destinationName, checkIn, checkOut, adults } = req.body;

    if (!cityId || !checkIn || !checkOut || !adults) {
        return res.status(400).json({ message: 'Не все обязательные параметры были переданы (cityId, checkIn, checkOut, adults).' });
    }

    const hotellookTargetParams = {
        adults: adults,
        checkIn: checkIn,
        checkOut: checkOut,
        cityId: cityId,
        currency: 'rub',
        destination: destinationName,
        language: 'ru',
        marker: `${YOUR_PARTNER_MARKER}._hotels` 
    };
    const targetUrl = `https://search.hotellook.com/hotels?${querystring.stringify(hotellookTargetParams)}`;
    const encodedTargetUrl = encodeURIComponent(targetUrl);
    const affiliateDeeplinkParams = {
        marker: YOUR_PARTNER_MARKER,
        trs: TRS_VALUE,
        p: P_VALUE_HOTELLOOK,
        u: encodedTargetUrl,
        campaign_id: CAMPAIGN_ID_HOTELLOOK
    };
    const affiliateDeeplink = `https://tp.media/r?${querystring.stringify(affiliateDeeplinkParams)}`;

    console.log('Сгенерирован Deeplink для Hotellook:', affiliateDeeplink);
    res.json({ success: true, deeplink: affiliateDeeplink });
});


// --- Конец Маршрутов API ---

// 11. Запуск сервера
app.listen(PORT, () => { 
    console.log(`+++ Server is now listening on port: ${PORT} +++`);
    if (!TRAVELPAYOUTS_API_TOKEN || TRAVELPAYOUTS_API_TOKEN === 'СЮДА_ВСТАВЬ_СВОЙ_РЕАЛЬНЫЙ_НОВЫЙ_API_ТОКЕН') {
        console.warn('!!! WARNING: Token is NOT set or is a placeholder. API calls may fail. !!!');
    } else {
        console.log('--- API Token seems to be correctly set. ---');
    }
    console.log('--- VPUTI.RU Backend Ready ---');
});