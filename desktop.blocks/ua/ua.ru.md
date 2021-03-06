# ua

Блок служит для сбора данных о десктопном браузере пользователя и позволяет определить:

* Тип браузера.
* Версию браузера.
* Совместимость с WebKit.

Блок реализован в технологии JS и подходит для использования в клиентских приложениях.

```js
modules.define('uatest',
    ['i-bem__dom', 'ua'],
        function(provide, BEMDOM, ua) {

provide(BEMDOM.decl(this.name, /** @lends uatest.prototype */
{ 
    onSetMod : {
        'js' : {
            'inited' : function() {
                console.dir(ua);
            }   
        }

    }
}));
});
```


Объект, получаемый callback-функцией после подключения блока, содержит специальные свойства, описывающие:

* Тип браузера(`{Boolean}`). В зависимости от него, объект будет содержать одно из следующих свойств:
    * `chrome` – Google Chrome.
    * `opera` – Opera.
    * `msie` – Microsoft Internet Explorer.
    * `mozilla` – Mozilla Firefox.
    * `safari` – Safari (или любой другой юзер-агент с поддержкой WebKit, кроме вышеперечисленных).
Значением любого из свойств является `true`. Это позволяет осуществлять проверки вида `if(ua.msie) { /* ... */ }`.
* Наличие поддержки WebKit(`{Boolean}`) – свойство `webkit`. Если поддерживается значением поля устанавливается `true`.
* Версию браузера(`{String}`) – свойство `version`. Значением служит строка с версией браузера вида `'600.2.5'` (для Safari). Если определить версию браузера не удается, в качестве значения устанавливается `'0'`.
