/**
 * МедСпринт — Триггер отправки формы
 *
 * КАК УСТАНОВИТЬ:
 * 1. Откройте Google Sheets (таблица реестра)
 * 2. Расширения → Apps Script
 * 3. Вставьте этот код
 * 4. Заполните WEBHOOK_URL ниже
 * 5. Запустите функцию setupTrigger() один раз
 * 6. Разрешите доступ
 */

// ← Вставьте URL из n8n (см. ниже как получить)
const WEBHOOK_URL = 'https://n8n.m-sprint.ru/webhook/medsprintagency-addendum';

/**
 * Вызывается автоматически при каждой отправке формы.
 * Отправляет данные в n8n через webhook.
 */
function onFormSubmitTrigger(e) {
  try {
    const values = e.namedValues;

    const payload = {
      'Email Address':                          (values['Email Address']                          || [''])[0],
      'Клиент':                                 (values['Клиент']                                 || [''])[0],
      'Услуга':                                 (values['Услуга']                                 || [''])[0],
      'Дата приложения':                        (values['Дата приложения']                        || [''])[0],
      'Дата начала работ':                      (values['Дата начала работ']                      || [''])[0],
      'Ссылка на файл реквизитов клиента':      (values['Ссылка на файл реквизитов клиента']      || [''])[0],
      'Дополнительные условия':                 (values['Дополнительные условия']                 || [''])[0]
    };

    UrlFetchApp.fetch(WEBHOOK_URL, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    Logger.log('✓ Webhook отправлен: ' + JSON.stringify(payload));
  } catch (err) {
    Logger.log('✗ Ошибка: ' + err.message);
  }
}

/**
 * Устанавливает триггер на отправку формы.
 * Запустите один раз вручную.
 */
function setupTrigger() {
  // Удаляем старые триггеры onFormSubmitTrigger чтобы не дублировать
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'onFormSubmitTrigger') {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Привязываем к форме через таблицу
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.newTrigger('onFormSubmitTrigger')
    .forSpreadsheet(ss)
    .onFormSubmit()
    .create();

  Logger.log('✓ Триггер установлен. Теперь каждая отправка формы будет вызывать n8n.');
}
