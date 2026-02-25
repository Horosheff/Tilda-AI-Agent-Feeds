<div align="center">
  <img src="tilda-kovcheg.png" alt="Tilda AI Agent Feeds Logo" width="120" />
</div>

<h1 align="center">Tilda AI Agent Feeds (ex. Tilda Kovcheg)</h1>

<p align="center">
  <b>Ультимативное Chrome-расширение для генерации "Jaw-Dropping" статей и обложек в Tilda Потоках.</b>
</p>

<div align="center">
  <img src="screenshot.png" alt="Tilda AI Agent Feeds Interface" width="400" />
</div>

<div align="center">
  <img src="https://img.shields.io/badge/Chrome-Extension-blue?logo=googlechrome&logoColor=white" alt="Chrome Extension" />
  <img src="https://img.shields.io/badge/AI-Gemini%203%20Pro-purple" alt="AI: Gemini 3 Pro" />
  <img src="https://img.shields.io/badge/Images-Nano%20Banana%20Pro-yellow" alt="Images: Nano Banana Pro" />
  <a href="https://t.me/maya_pro"><img src="https://img.shields.io/badge/Telegram-Developer-blue?logo=telegram" alt="Developer Telegram" /></a>
</div>

---

## 🚀 Особенности

- ✍️ **Умная генерация текста:** Пишет статьи в стиле `Senior SEO Editor`. Интеграция с официальным API Google Gemini (3 Pro) и неофициальным [kie.ai](https://kie.ai).
- 🎨 **Jaw-Dropping обложки:** Генерация сочных коллажных обложек (стиль рунета 2016-х) прямо в интерфейсе через Nano Banana Pro или Gemini Image.
- 🧠 **Локальный RAG (Память бренда):** Расширение запоминает факты о вашей компании и автоматически подмешивает их в тексты.
- 🗣 **Tone of Voice:** Встроенные пресеты тона (Официальный, Дружелюбный, Кликбейт, Обучающий, Продающий).
- ⚙️ **SEO-Агент (Wordstat):** Подключается к Яндекс.Вордстат, анализирует семантику, подбирает ключи и автоматически вписывает их без переспама!
- 🗂 **История генераций:** Никогда не теряйте свои удачные промпты. Вы всегда можете скопировать их из встроенного журнала.
- ⚡ **Super-Prompt v4:** Встроенная хардкор-инструкция для получения статей топового уровня, сразу готовых под SEO и GEO (Generative Engine Optimization).

---

## 🛠 Установка (Режим Разработчика)

1. **Скачайте** (или клонируйте) этот репозиторий себе на компьютер.
2. Откройте браузер Chrome и перейдите по адресу: `chrome://extensions/`.
3. Включите **«Режим разработчика»** (тумблер в правом верхнем углу).
4. Нажмите **«Загрузить распакованное расширение»** и выберите папку, в которой лежит файл `manifest.json`.
5. Убедитесь, что в корне проекта лежит файл **`tilda-kovcheg.png`** (он используется как иконка).

---

## 🔑 Настройка API

1. **kie.ai:** Зарегистрируйтесь на [kie.ai](https://kie.ai) и получите API ключ. Это универсальный хаб для доступа к ИИ.
2. *(Опционально)* **Google AI Studio:** Вы можете использовать официальный бесплатный API ключ от Google (потребуется VPN для РФ).
3. Нажмите на иконку расширения в панели Chrome 🧩.
4. Вставьте ключ(и), заполните имя автора по умолчанию и нажмите **«Сохранить»**.

---

## 💻 Как использовать

1. Зайдите в панель управления **Tilda → Потоки** (редактор поста).
2. На экране автоматически появится стильная плавающая панель **«Tilda IA Agent»**.
3. **Промпт генерации (Инструкции):** Введите, как именно писать статью (или выберите ваш сохраненный пресет).
4. **Тема или вводная информация:** Скопируйте сюда сырой текст, тему, факты или наброски.
5. Настройте параметры генерации, SEO, Wordstat и Обложку (если необходимо).
6. Нажмите **«Заполнить всё»** — и смотрите магию! Агент самостоятельно напишет статью, подберет обложку и **автоматически расставит всё по нужным полям Tilda** (Заголовок, Описание, SEO-теги, Текст, Изображение).

---

## 💰 Стоимость API (kie.ai)

- **Gemini 3 Pro:** вход ~$0.50 / 1M токенов, выход ~$3.50 / 1M токенов.
- **Nano Banana Pro:** 18–24 кредита за генерацию одного изображения.

> *Актуальные тарифы и лимиты смотрите на официальном сайте [kie.ai](https://kie.ai).*

---

## 🧩 Архитектура работы Агента

```mermaid
graph TD
    %% Стили узлов
    classDef ui fill:#6B46C1,stroke:#4C2889,stroke-width:2px,color:#fff,font-weight:bold;
    classDef agent fill:#FFD700,stroke:#D4AF37,stroke-width:2px,color:#000,font-weight:bold;
    classDef api fill:#10B981,stroke:#059669,stroke-width:2px,color:#fff,font-weight:bold;
    classDef db fill:#3B82F6,stroke:#2563EB,stroke-width:2px,color:#fff,font-weight:bold;

    subgraph "1. Интерфейс (Браузер / Tilda)"
        A[Панель Tilda IA Agent]:::ui -->|Инструкции + Тема + Настройки| B(Extension Background):::ui
        H(Инжектор DOM Tilda):::ui -->|Автозаполнение полей| I[Готовая SEO-Статья]:::ui
    end

    subgraph "2. Ядро Агента (Service Worker)"
        B --> C{SEO Wordstat Agent}:::agent
        C -.->|Сбор семантики| D[Yandex Wordstat]:::api
        D -.->|Релевантные ключи| C
        
        C --> E{Обогащение Контекста}:::agent
        E -.->|Local RAG| DB1[(Память Бренда)]:::db
        E -.->|Tone of Voice| DB2[(Пресеты Стиля)]:::db
        E -.->|Super-Prompt v4| DB3[(SEO/GEO Правила)]:::db
        
        E --> F[Оркестратор Генерации]:::agent
    end

    subgraph "3. Нейросети (kie.ai / Official)"
        F -->|Текстовый Промпт| G1[Gemini 3.1 Pro]:::api
        F -->|Визуальный Промпт| G2[Nano Banana / Gemini Image]:::api
    end

    G1 -->|Строгий JSON ответ| H
    G2 -->|Готовая Обложка по URL| H
```

---

## 📝 Разработка и структура

- `manifest.json` — конфигурация расширения (Manifest V3).
- `background.js` — сервис-воркер, мозг агента: управление запросами к ИИ, цепочки мыслей (Chain of Thought), проксирование.
- `lib/api-text.js` & `lib/api-image.js` — логика работы с LLM (Gemini, Nano Banana, Wordstat).
- `content/content.js` & `content/content.css` — инжектируемый интерфейс (Jaw-Dropping панель) и логика работы с DOM редактора Tilda.
- `popup/popup.html` & `popup/popup.js` — настройки расширения и управление ключами API.

---

<div align="center">
  <i>Создано для того, чтобы автоматизировать рутину и вернуть время на творчество!</i><br>
  💬 <b>Связь с разработчиком и обновления:</b> <a href="https://t.me/maya_pro">@maya_pro</a>
</div>