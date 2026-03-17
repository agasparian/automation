/**
 * МедСпринт — Автоматизация приложений к договору
 * Скрипт создаёт все необходимые файлы в Google Drive за один запуск.
 *
 * КАК ЗАПУСТИТЬ:
 * 1. Откройте https://script.google.com
 * 2. Создайте новый проект (Новый проект)
 * 3. Вставьте весь этот код, заменив содержимое файла Code.gs
 * 4. Заполните раздел CONFIG ниже (ALLOWED_EMAILS и PILOT_CLIENT.folderId)
 * 5. Нажмите Run → setup
 * 6. Разрешите доступ (Google попросит один раз)
 * 7. Откройте Logs (Ctrl+Enter) — там будут все ссылки
 */

// ============================================================
// НАСТРОЙКИ — заполните перед запуском
// ============================================================
const CONFIG = {

  // Папка реестра на Drive (ID из URL папки)
  PARENT_FOLDER_ID: '18L1rwRLSt5zNOKMBcgtnBXmaG_VA1lmK',

  SHEETS_NAME:           'МедСпринт — Реестр приложений',
  FORM_NAME:             'Новое приложение к договору — МедСпринт',
  TEMPLATES_FOLDER_NAME: 'Шаблоны приложений',
  PILOT_TEMPLATE_NAME:   'Шаблон — Поддержка сайта',

  // Пилотный клиент — первая строка в листе «Клиенты»
  // folderId — ID папки клиента на Drive (возьмите из URL папки)
  PILOT_CLIENT: {
    name:      'ООО «Интерстар»',
    folderId:  '',  // ← вставьте ID папки клиента
    lastDocId: '16n43bowjGnALcQVLTz-N-SVw1ej58ikq'
  },

  // Список услуг в форме
  SERVICES: [
    'Поддержка сайта',
    'SEO-продвижение',
    'Контекстная реклама',
    'Медицинский копирайтинг',
    'SMM',
    'Таргетированная реклама',
    'Разработка сайта',
    'Маркетинговая стратегия'
  ],

  // Сотрудники, которым разрешено заполнять форму
  // Добавьте строки: { email: '...@gmail.com', name: 'Фамилия И.', role: 'Менеджер' }
  ALLOWED_EMAILS: [
    // { email: 'manager@gmail.com', name: 'Иванов А.', role: 'Менеджер' },
  ]
};

// ============================================================
// ОСНОВНАЯ ФУНКЦИЯ
// ============================================================
function setup() {
  Logger.log('▶ Запуск setup...');

  const folder = DriveApp.getFolderById(CONFIG.PARENT_FOLDER_ID);
  Logger.log('✓ Папка найдена: ' + folder.getName());

  // 1. Папка для шаблонов
  const templatesFolder = getOrCreateFolder(folder, CONFIG.TEMPLATES_FOLDER_NAME);
  Logger.log('✓ Папка шаблонов: ' + templatesFolder.getUrl());

  // 2. Google Sheets (4 листа)
  const ss = createSpreadsheet(folder);
  Logger.log('✓ Таблица создана: ' + ss.getUrl());

  // 3. Google Doc шаблон
  const templateDoc = createTemplateDoc(templatesFolder);
  Logger.log('✓ Шаблон Doc создан: ' + templateDoc.getUrl());

  // 4. Записать ID шаблона в лист «Шаблоны»
  ss.getSheetByName('Шаблоны')
    .getRange(2, 1, 1, 2)
    .setValues([['Поддержка сайта', templateDoc.getId()]]);

  // 5. Google Form (привязана к таблице)
  const form = createForm(ss);
  DriveApp.getFileById(form.getId()).moveTo(folder);
  Logger.log('✓ Форма создана: ' + form.getPublishedUrl());

  // 6. Записать ссылки в служебный лист
  writeInfoSheet(ss, templateDoc, form, templatesFolder);

  // Итог
  Logger.log('');
  Logger.log('========================================');
  Logger.log('✅ ВСЁ ГОТОВО');
  Logger.log('========================================');
  Logger.log('📊 Sheets:        ' + ss.getUrl());
  Logger.log('📝 Шаблон Doc:    ' + templateDoc.getUrl());
  Logger.log('📋 Форма:         ' + form.getPublishedUrl());
  Logger.log('📋 Форма (ред.):  ' + form.getEditUrl());
  Logger.log('');
  Logger.log('Следующие шаги:');
  Logger.log('1. Заполните ID папок клиентов в листе «Клиенты»');
  Logger.log('2. Добавьте email сотрудников в лист «Допущенные»');
  Logger.log('3. Передайте ссылки разработчику для настройки n8n');
  Logger.log('   Sheets ID: ' + ss.getId());
  Logger.log('   Template Doc ID: ' + templateDoc.getId());
}

// ============================================================
// GOOGLE SHEETS
// ============================================================
function createSpreadsheet(folder) {
  const ss = SpreadsheetApp.create(CONFIG.SHEETS_NAME);
  DriveApp.getFileById(ss.getId()).moveTo(folder);

  const sheet1 = ss.getSheets()[0];
  sheet1.setName('Клиенты');
  setupClientsSheet(sheet1);
  setupRegistrySheet(ss.insertSheet('Реестр приложений'));
  setupTemplatesSheet(ss.insertSheet('Шаблоны'));
  setupAllowedSheet(ss.insertSheet('Допущенные'));

  return ss;
}

function setupClientsSheet(sheet) {
  const headers = ['Название клиента', 'ID папки Drive', 'ID последнего Doc'];
  styleHeader(sheet.getRange(1, 1, 1, 3).setValues([headers]));
  sheet.setColumnWidths(1, 3, 280);
  sheet.setFrozenRows(1);

  if (CONFIG.PILOT_CLIENT.name) {
    sheet.getRange(2, 1, 1, 3).setValues([[
      CONFIG.PILOT_CLIENT.name,
      CONFIG.PILOT_CLIENT.folderId || '← вставьте ID папки клиента',
      CONFIG.PILOT_CLIENT.lastDocId
    ]]);
  }
}

function setupRegistrySheet(sheet) {
  const headers = ['Дата', 'Клиент', 'Услуга', '№ приложения', 'Ссылка на Doc', 'Статус', 'Кто создал'];
  styleHeader(sheet.getRange(1, 1, 1, 7).setValues([headers]));
  sheet.setColumnWidths(1, 4, 150);
  sheet.setColumnWidth(5, 350);
  sheet.setColumnWidths(6, 2, 150);
  sheet.setFrozenRows(1);
}

function setupTemplatesSheet(sheet) {
  const headers = ['Услуга', 'ID шаблона на Drive'];
  styleHeader(sheet.getRange(1, 1, 1, 2).setValues([headers]));
  sheet.setColumnWidth(1, 250);
  sheet.setColumnWidth(2, 350);
  sheet.setFrozenRows(1);
}

function setupAllowedSheet(sheet) {
  const headers = ['Email', 'Имя', 'Роль'];
  styleHeader(sheet.getRange(1, 1, 1, 3).setValues([headers]));
  sheet.setColumnWidths(1, 3, 220);
  sheet.setFrozenRows(1);

  if (CONFIG.ALLOWED_EMAILS.length > 0) {
    const data = CONFIG.ALLOWED_EMAILS.map(e => [e.email, e.name, e.role]);
    sheet.getRange(2, 1, data.length, 3).setValues(data);
  }
}

// ============================================================
// GOOGLE DOC ШАБЛОН
// ============================================================
function createTemplateDoc(folder) {
  const doc = DocumentApp.create(CONFIG.PILOT_TEMPLATE_NAME);
  DriveApp.getFileById(doc.getId()).moveTo(folder);

  const body = doc.getBody();
  body.clear();

  // Заголовок
  body.appendParagraph('Приложение № {{НОМЕР_ПРИЛОЖЕНИЯ}}')
      .setHeading(DocumentApp.ParagraphHeading.HEADING1)
      .setAlignment(DocumentApp.HorizontalAlignment.CENTER);

  body.appendParagraph('к Договору № {{НОМЕР_ДОГОВОРА}} от {{ДАТА_ДОГОВОРА}}')
      .setAlignment(DocumentApp.HorizontalAlignment.CENTER);

  body.appendParagraph('');

  body.appendParagraph('Поддержка сайтов')
      .setHeading(DocumentApp.ParagraphHeading.HEADING2)
      .setAlignment(DocumentApp.HorizontalAlignment.CENTER);

  body.appendParagraph('');
  body.appendParagraph('г. Москва | {{ДАТА_ПРИЛОЖЕНИЯ}}');
  body.appendParagraph('');

  // Задачи
  body.appendParagraph('Задачи').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendListItem('Улучшение сайтов для повышения удобства посетителей, внедрение нового функционала')
      .setGlyphType(DocumentApp.GlyphType.BULLET);
  body.appendListItem('Выполнение услуг по контент-менеджменту сайтов Заказчика')
      .setGlyphType(DocumentApp.GlyphType.BULLET);
  body.appendListItem('Обеспечение бесперебойной работы на уровне CMS')
      .setGlyphType(DocumentApp.GlyphType.BULLET);
  body.appendParagraph('');

  // Сроки и стоимость
  body.appendParagraph('Сроки и стоимость').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('Начало: {{ДАТА_НАЧАЛА_РАБОТ}}');
  body.appendParagraph('');
  body.appendParagraph('Таблица 1. Часовые ставки с НДС 5%:');

  const ratesTable = body.appendTable([
    ['Специалист',                'Ставка'],
    ['Дизайнер',                  '2 625 ₽'],
    ['Разработчик / верстальщик', '2 900 ₽'],
    ['Тестировщик',               '1 850 ₽'],
    ['Контент-менеджер',          '1 470 ₽'],
    ['Менеджер',                  '2 100 ₽'],
    ['Маркетолог',                '2 625 ₽']
  ]);
  // Стиль заголовка таблицы
  ratesTable.getRow(0).getCell(0).setBackgroundColor('#d9e1f2');
  ratesTable.getRow(0).getCell(1).setBackgroundColor('#d9e1f2');
  body.appendParagraph('');

  // Оплата
  body.appendParagraph('Оплата').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(
    'Заказчик производит 100% оплату стоимости услуг за отчётный месяц в течение ' +
    '10 (Десяти) рабочих дней после получения счёта.'
  );
  body.appendParagraph('');

  // Отчётность
  body.appendParagraph('Отчётность').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(
    'УПД и отчёт предоставляются до 10-го числа следующего месяца. ' +
    'При отсутствии возражений в течение 5 рабочих дней работа считается выполненной надлежащим образом.'
  );
  body.appendParagraph('');

  // Подписи
  body.appendParagraph('Подписи сторон').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendTable([
    ['От Исполнителя',                              'От Заказчика'],
    ['ООО «М-Спринт»',                              '{{НАЗВАНИЕ_КЛИЕНТА}}'],
    ['А.Р. Гаспарян',                               '{{ФИО_ПОДПИСАНТА_КЛИЕНТА}}'],
    ['_______ / Гаспарян А.Р. /',                   '_______ / {{ФИО_ПОДПИСАНТА_КЛИЕНТА}} /']
  ]);

  doc.saveAndClose();
  return doc;
}

// ============================================================
// GOOGLE FORM
// ============================================================
function createForm(ss) {
  const form = FormApp.create(CONFIG.FORM_NAME);
  form.setCollectEmail(true);
  form.setDescription(
    'Заполните форму для автоматического создания приложения к договору.\n' +
    'Готовый документ придёт вам на email в течение минуты.'
  );
  form.setConfirmationMessage('✅ Запрос принят! Документ будет готов через минуту — проверьте email.');

  // Клиент
  const clients = ss.getSheetByName('Клиенты').getDataRange().getValues();
  const clientNames = clients.slice(1)
    .map(row => row[0])
    .filter(name => name && !name.startsWith('←'));

  form.addListItem()
      .setTitle('Клиент')
      .setRequired(true)
      .setChoiceValues(clientNames.length > 0 ? clientNames : ['Добавьте клиентов в лист «Клиенты»']);

  // Услуга
  form.addListItem()
      .setTitle('Услуга')
      .setRequired(true)
      .setChoiceValues(CONFIG.SERVICES);

  // Дата приложения
  form.addDateItem()
      .setTitle('Дата приложения')
      .setRequired(true);

  // Дата начала работ
  form.addDateItem()
      .setTitle('Дата начала работ')
      .setRequired(true);

  // Ссылка на реквизиты
  form.addTextItem()
      .setTitle('Ссылка на файл реквизитов клиента')
      .setRequired(true)
      .setHelpText('Вставьте URL Google Doc с реквизитами из папки клиента.\nПример: https://docs.google.com/document/d/XXXX/edit');

  // Доп. условия
  form.addParagraphTextItem()
      .setTitle('Дополнительные условия')
      .setRequired(false)
      .setHelpText('Необязательно. Укажите особые условия, если они есть.');

  // Привязать к таблице
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  return form;
}

// ============================================================
// СЛУЖЕБНЫЕ ФУНКЦИИ
// ============================================================
function getOrCreateFolder(parentFolder, folderName) {
  const existing = parentFolder.getFoldersByName(folderName);
  return existing.hasNext() ? existing.next() : parentFolder.createFolder(folderName);
}

function styleHeader(range) {
  range.setFontWeight('bold').setBackground('#d9e1f2');
  return range;
}

function writeInfoSheet(ss, templateDoc, form, templatesFolder) {
  const sheet = ss.insertSheet('_Ссылки');
  styleHeader(sheet.getRange('A1:B1').setValues([['Что', 'Ссылка']]));
  sheet.getRange('A2:B7').setValues([
    ['Эта таблица (Sheets)',        ss.getUrl()],
    ['Шаблон — Поддержка сайта',   templateDoc.getUrl()],
    ['Форма (для сотрудников)',     form.getPublishedUrl()],
    ['Форма (редактор)',            form.getEditUrl()],
    ['Папка шаблонов',             'https://drive.google.com/drive/folders/' + templatesFolder.getId()],
    ['Sheets ID (для n8n)',         ss.getId()],
  ]);
  sheet.autoResizeColumns(1, 2);
}
