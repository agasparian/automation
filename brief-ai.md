# Brief: МедСпринт — AI-версия workflow

> Это проектный документ. Описывает, как бы выглядел тот же workflow,
> если заменить хрупкие regex-парсеры на вызовы Claude API.
> Остальная логика — без изменений.

---

## Проблема, которую решает ИИ

В текущей версии два узких места — парсинг документов:

| Нода | Что делает | Почему хрупко |
|------|-----------|---------------|
| `parse-prev-doc` | Извлекает № и дату договора, № приложения из тела предыдущего приложения | Regex ломается при `«16» февраля`, `Приложение 1` (без №), разных форматах даты |
| `parse-requisites` | Извлекает название клиента и подписанта из файла реквизитов | Ломается если реквизиты в таблице, а не списком `Ключ: Значение` |

**Симптом:** после каждого изменения в оформлении документа — новый regex, новая отладка.

**Решение с ИИ:** вместо regex — запрос к Claude API. Модель понимает текст в любом формате и возвращает структурированный JSON.

---

## Что меняется в архитектуре

### Текущий поток (с regex)

```
Прочитать документ (Google Docs API)
        │
        ▼
parse-prev-doc (Code, ~60 строк regex)
        │
        ▼
parse-requisites (Code, ~30 строк regex)
        │
        ▼
collect-client-data (merge результатов)
```

### AI-поток

```
Прочитать документ (Google Docs API)
        │
        ▼
extract-text (Code, ~10 строк — только сборка текста из структуры Docs API)
        │
        ▼
claude-parse-doc (HTTP Request → Anthropic API)
        │
        ▼
parse-ai-response (Code, ~5 строк — JSON.parse ответа)
        │
        ▼
collect-client-data (тот же merge, без изменений)
```

**Количество нод:** то же. Сложность: меньше. Надёжность: выше.

---

## Детали реализации

### Нода `extract-text` (Code)

Единственная задача — собрать plain text из структуры Google Docs API.
Эта логика и сейчас есть в `parse-prev-doc`, просто выносим в отдельную ноду.

```javascript
const content = $input.item.json.body?.content || [];

const text = content.flatMap(block => {
  const paras = block.paragraph?.elements || [];
  return paras.map(el => el.textRun?.content || '');
}).join('');

return [{ json: { text, docTitle: $input.item.json.title || '' } }];
```

---

### Нода `claude-parse-prev-doc` (HTTP Request)

**Метод:** POST
**URL:** `https://api.anthropic.com/v1/messages`

**Headers:**
```
x-api-key:          {{ $credentials.anthropicApiKey }}
anthropic-version:  2023-06-01
content-type:       application/json
```

**Body (JSON):**
```json
{
  "model": "claude-haiku-4-5-20251001",
  "max_tokens": 256,
  "system": "Ты — парсер юридических документов. Извлекай данные строго по инструкции. Отвечай только валидным JSON, без объяснений.",
  "messages": [
    {
      "role": "user",
      "content": "Из текста приложения к договору извлеки три поля:\n- nomerDogovora: номер основного договора (например «8/12/2025/М/И» или «16/02/2026/М/ИК»)\n- dataDogovora: дата основного договора в формате «D месяц YYYY г.» (например «16 февраля 2026 г.»)\n- nomerPrilozhenia: порядковый номер ЭТОГО приложения (целое число, например «1» или «3»)\n\nЕсли поле не найдено — пустая строка. Ответ: только JSON-объект.\n\nТекст документа:\n{{ $('extract-text').item.json.text }}\n\nЗаголовок: {{ $('extract-text').item.json.docTitle }}"
    }
  ]
}
```

**Почему Haiku, а не Sonnet/Opus:**
Задача простая и структурированная. Haiku справляется с ней надёжнее, чем regex, стоит ~в 20 раз дешевле Sonnet, и отвечает за ~0.5 сек.

---

### Нода `parse-ai-response` (Code)

```javascript
const raw = $input.item.json.content?.[0]?.text || '{}';

let parsed;
try {
  // Убираем markdown-обёртку если модель всё же добавила ```json
  const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  parsed = JSON.parse(clean);
} catch (e) {
  throw new Error('Claude вернул невалидный JSON: ' + raw);
}

const { nomerDogovora = '', dataDogovora = '', nomerPrilozhenia = '1' } = parsed;

if (!nomerDogovora) throw new Error('Claude не нашёл номер договора в документе.');
if (!dataDogovora)  throw new Error('Claude не нашёл дату договора в документе.');

return [{ json: { nomerDogovora, dataDogovora, nomerPrilozhenia } }];
```

---

### Нода `claude-parse-requisites` (HTTP Request)

Аналогично, но для файла реквизитов:

**Промпт в `messages[0].content`:**
```
Из текста документа с реквизитами клиента извлеки три поля:
- clientName: полное юридическое название организации (например «ООО «Интерстар»»)
- signatoryName: ФИО подписанта в формате «И.О. Фамилия» (например «И.В. Канцан»)
- signatoryTitle: должность подписанта (например «Генеральный директор»)

Если поле не найдено — пустая строка. Ответ: только JSON-объект.

Текст документа:
{{ $('extract-requisites-text').item.json.text }}
```

---

## Промпт-инжиниринг: принципы для этого проекта

### 1. Формат ответа — JSON без обёртки

В `system`-промпте явно запрещаем Markdown:
```
"Отвечай только валидным JSON, без объяснений и без ```json."
```

Дополнительно — защитный `replace` в Code-ноде на случай нарушения.

### 2. Примеры в промпте (few-shot)

Если Claude иногда ошибается с форматом — добавить пример прямо в промпт:

```
Пример правильного ответа:
{"nomerDogovora":"8/12/2025/М/И","dataDogovora":"8 декабря 2025 г.","nomerPrilozhenia":"2"}
```

### 3. Fallback: если AI не нашёл поле

В `parse-ai-response` при пустом `nomerDogovora` можно:
- Выбросить ошибку → менеджер получит email с просьбой заполнить вручную
- Или попробовать regex как запасной вариант (но тогда теряем простоту)

Рекомендация: **выбрасывать ошибку**. Это честнее — лучше сообщить о проблеме, чем молча подставить неверные данные в договор.

---

## Стоимость

| Параметр | Значение |
|----------|---------|
| Модель | Claude Haiku 4.5 |
| Цена | $0.80 / M вх. токенов, $4 / M исх. токенов |
| Типичный запрос | ~2 000 вх. токенов (текст документа) + ~150 исх. токенов (JSON) |
| Стоимость 1 запроса | ≈ $0.0022 |
| 2 запроса на выполнение (prev-doc + requisites) | ≈ $0.004 |
| 100 приложений в месяц | ≈ **$0.40 / мес** |

Для сравнения: одна минута работы менеджера над опечаткой в договоре стоит дороже.

---

## Что НЕ меняется

Всё остальное в workflow остаётся идентичным текущей версии:

- Триггер (Webhook / Apps Script) — без изменений
- Проверка email-допуска — без изменений
- Ветвление `has-prev-app` (повторное / первое приложение) — без изменений
- `first-app-contract` (данные из формы для первого приложения) — без изменений
- `collect-client-data` (merge результатов) — без изменений
- `format-dates` → `get-prev-doc-folder` → `copy-template` — без изменений
- `prepare-batch-body` → `batchUpdate` (замена плейсхолдеров) — без изменений
- `append-registry` → `update-client-doc-id` → `notify-manager` — без изменений

ИИ — точечная замена только двух Code-нод с regex. Остальная логика не трогается.

---

## Итоговая схема AI-workflow

```
[Webhook] → [Проверить email] → [Повторное приложение?]
                                         │
              ┌──────────── ДА ──────────┘──────── НЕТ ───────────┐
              ▼                                                    ▼
  [resolve-prev-doc-id]                             [first-app-contract]
              │                                                    │
              ▼                                                    │
  [Прочитать предыдущее приложение]                               │
              │                                                    │
              ▼                                                    │
  [extract-text]                                                   │
              │                                                    │
              ▼                                                    │
  [claude-parse-prev-doc] ◄── Anthropic API                       │
              │                                                    │
              ▼                                                    │
  [parse-ai-response]                                             │
              │                                                    │
              └──────────────────────────┐─────────────────────────┘
                                         ▼
                          [extract-requisites-id]
                                         │
                                         ▼
                          [Прочитать реквизиты]
                                         │
                                         ▼
                          [extract-requisites-text]
                                         │
                                         ▼
                          [claude-parse-requisites] ◄── Anthropic API
                                         │
                                         ▼
                          [parse-requisites-response]
                                         │
                                         ▼
                          [collect-client-data] (merge)
                                         │
                                         ▼
                          [format-dates] → [get-prev-doc-folder]
                                         │
                                         ▼
                          [copy-template] → [prepare-batch-body]
                                         │
                                         ▼
                          [batchUpdate] → [append-registry]
                                         │
                                         ▼
                          [update-client-doc-id] → [notify-manager]
```

---

## Когда переходить на AI-версию

**Сейчас** (regex-версия) подходит если:
- Документы всегда одного формата
- Команда готова чинить regex при изменениях

**AI-версия нужна если:**
- Появляются новые форматы документов (другие клиенты, другие шаблоны)
- Разные сотрудники по-разному оформляют реквизиты
- Время на отладку regex превышает $0.40/мес на API

Рекомендация: переход на AI-версию оправдан как только появится второй клиент с другим оформлением документов.

---

## Настройка Anthropic API в n8n

1. Зарегистрироваться на `console.anthropic.com`
2. Создать API key (раздел «API Keys»)
3. В n8n: Settings → Credentials → New → «Header Auth»
   - Name: `Anthropic API`
   - Header Name: `x-api-key`
   - Header Value: `sk-ant-...`
4. В нодах HTTP Request выбрать это credential

Альтернатива: n8n может иметь встроенный Anthropic-credential (зависит от версии).
Проверить: Add Credential → поиск «Anthropic».
