Оркестратор сервисов на nodejs
----------------------------

В папке services лежат запускаемые сервисы.

config.json содержит конфигурации, отправляемые сервисам сразу 
после их запуска.
Если сервис упал, его через некоторое время запускаем опять.
Допусается пока только один экземпляр сервиса
Все сервисы общаются между собой через отправку сообщений
ipc.sendCommand (to, cmd, data)

Все сервисы в начале модуля содержат описание манифеста своих интерфейсов.
ipc проверяет соответствие отправляемой команды манифесту и выдает ошибку, 
если манифест модуля требует другой состав данных.