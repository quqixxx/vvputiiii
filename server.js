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
const TRAVELPAYOUTS_API_TOKEN = process.env.TRAVELPAYOUTS_API_TOKEN;
const YOUR_PARTNER_MARKER = '636492'; 
const TRS_VALUE = '422197';
const P_VALUE_AVIASALES = '4114';     
const P_VALUE_HOTELLOOK = '4115';
const CAMPAIGN_ID_AVIASALES = '100';
const CAMPAIGN_ID_HOTELLOOK = '101';

// 4. Настройка CORS для "живого" сайта
const allowedOrigins = [
  'http://localhost:5173',                         // Для нашей локальной разработки
  'https://vputi.netlify.app',                   // Наш основной "красивый" адрес
  'https://superb-kelpie-fca21d.netlify.app'     // <<< ДОБАВЛЕН НОВЫЙ АДРЕС, С КОТОРОГО БЫЛА ОШИБКА
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
};

// 5. Подключение middleware
app.use(cors(corsOptions)); 
app.use(express.json());

// --- Начало Маршрутов API ---

// 6. Тестовый маршрут GET /
app.get('/', (req, res) => {
    res.send('Привет! Бэкенд "ВПути.ру" запущен и готов к работе!');
});

// 7. Маршрут для поиска цен на авиабилеты
app.get('/api/test-flight-prices', async (req, res) => {
    if (!TRAVELPAYOUTS_API_TOKEN) { return res.status(500).json({ message: 'Ошибка конфигурации сервера: API токен не настроен.' }); } 
    const { origin, destination, departure_at } = req.query;
    if (!origin || !destination || !departure_at) { return res.status(400).json({ message: 'Необходимы параметры origin, destination и departure_at' }); }
    const currency = req.query.currency || 'rub';
    const limit = parseInt(req.query.limit) || 30;
    const flightPricesApiUrl = `https://api.travelpayouts.com/aviasales/v3/prices_for_dates`;
    try {
        const response = await axios.get(flightPricesApiUrl, {
            params: { origin, destination, departure_at, currency, limit, token: TRAVELPAYOUTS_API_TOKEN },
            timeout: 15000 
        }); 
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
    if (!aviasales_relative_link) { return res.status(400).json({ message: 'Параметр "aviasales_relative_link" обязателен.' }); }
    const targetUrl = `https://www.aviasales.ru${aviasales_relative_link}`; 
    const encodedTargetUrl = encodeURIComponent(targetUrl);
    const deeplinkParams = {
        marker: YOUR_PARTNER_MARKER, trs: TRS_VALUE, p: P_VALUE_AVIASALES,
        u: encodedTargetUrl, campaign_id: CAMPAIGN_ID_AVIASALES
    };
    const affiliateDeeplink = `https://tp.media/r?${querystring.stringify(deeplinkParams)}`;
    res.json({ success: true, deeplink: affiliateDeeplink });
});

// 9. Маршрут для автодополнения мест
app.get('/api/suggest-places-autocomplete', async (req, res) => {
    const { term, locale = 'ru' } = req.query;
    if (!TRAVELPAYOUTS_API_TOKEN) { return res.status(500).json({ message: 'Ошибка конфигурации сервера: API токен не настроен.' }); }
    if (!term) { return res.status(400).json({ message: 'Параметр "term" (поисковый запрос) обязателен.' }); }
    const placesApiUrl = `https://api.travelpayouts.com/data/${locale}/cities.json`;
    try {
        const response = await axios.get(placesApiUrl, { params: { token: TRAVELPAYOUTS_API_TOKEN } });
        const suggestions = response.data.filter(city => city.name && city.name.toLowerCase().startsWith(term.toLowerCase())).slice(0, 7);
        res.json(suggestions);
    } catch (error) {
        const errorMessage = error.response ? `Статус: ${error.response.status}, Тело ответа: ${JSON.stringify(error.response.data)}` : error.message;
        console.error('Ошибка при запросе к Travelpayouts Data API (СПИСОК ГОРОДОВ):', errorMessage);
        res.status(500).json({ message: 'Ошибка при получении списка мест от внешнего сервиса (автодополнение).' });
    }
});

// 10. Маршрут для генерации deeplink для Отелей
app.post('/api/generate-hotel-deeplink', (req, res) => {
    const { cityId, destinationName, checkIn, checkOut, adults } = req.body;
    if (!cityId || !checkIn || !checkOut || !adults) { return res.status(400).json({ message: 'Не все обязательные параметры были переданы.' }); }
    const hotellookTargetParams = {
        adults, checkIn, checkOut, cityId, 
        currency: 'rub', destination: destinationName, language: 'ru', 
        marker: `${YOUR_PARTNER_MARKER}._hotels` 
    };
    const targetUrl = `https://search.hotellook.com/hotels?${querystring.stringify(hotellookTargetParams)}`;
    const encodedTargetUrl = encodeURIComponent(targetUrl);
    const affiliateDeeplinkParams = {
        marker: YOUR_PARTNER_MARKER, trs: TRS_VALUE, p: P_VALUE_HOTELLOOK,
        u: encodedTargetUrl, campaign_id: CAMPAIGN_ID_HOTELLOOK
    };
    const affiliateDeeplink = `https://tp.media/r?${querystring.stringify(affiliateDeeplinkParams)}`;
    res.json({ success: true, deeplink: affiliateDeeplink });
});


// --- Конец Маршрутов API ---

// 11. Запуск сервера
app.listen(PORT, () => { 
    console.log(`+++ Server is now listening on port: ${PORT} +++`);
    if (!TRAVELPAYOUTS_API_TOKEN) {
        console.warn('!!! WARNING: TRAVELPAYOUTS_API_TOKEN environment variable is not set. !!!');
    } else {
        console.log('--- API Token is loaded from environment variables. ---');
    }
    console.log('--- VPUTI.RU Backend Ready ---');
});