/* Автономный режим: браузер сам обрабатывает каталог, сессию и демонстрационные заказы. */
(function () {
  window.KUCHER_CONFIG = Object.assign({
    STATIC_MODE: true,
    DEMO_MODE: true,
    YANDEX_MAPS_API_KEY: '',
  }, window.KUCHER_CONFIG || {});
})();
