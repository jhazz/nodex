Оркестратор сервисов на nodejs
------------------------------

В папке services лежат запускаемые сервисы.

config.json содержит конфигурации, отправляемые сервисам сразу 
после их запуска.
Если сервис упал, диспетчер через некоторое время запускает опять.
На данный момент допускается только один экземпляр сервиса. 

Все сервисы общаются между собой через отправку сообщений
ipc.sendCommand (to, cmd, data)

Все сервисы в начале модуля содержат описание манифеста своих интерфейсов.
ipc проверяет соответствие отправляемой команды манифесту и выдает ошибку, 
если манифест модуля требует другой состав данных.


TODO
====

- Сделать пулы для масштабирования нагрузки на ноду. Конфиг будет содержать 
  количество предзапущенных экземпляров и условия убивания, рестарта.
- Сделать отложенную загрузку - если сервис долго не используется - выпинывать его, 
  если указано в конфиге. Понадобился (пришло сообщение) - поднимаем.