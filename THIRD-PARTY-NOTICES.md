# Встроенные библиотеки

MIT в корне относится к собственному коду scheduler4000. Перечисленные ниже компоненты распространяются на условиях своих правообладателей. Исходные уведомления в макетах сохранены; лицензии включены в репозиторий и архив выпуска.

| Компонент | Версия | Лицензия и локальная копия |
| --- | --- | --- |
| vis-timeline / vis-graph2d | 7.7.3 | [MIT или Apache 2.0](licenses/vis-timeline/LICENSE.md), [MIT](licenses/vis-timeline/LICENSE.MIT.txt), [Apache 2.0](licenses/vis-timeline/LICENSE.Apache-2.0.txt) |
| Moment.js, внутри vis | 2.29.4 | [MIT](licenses/Moment-2.29.4-MIT.txt) |
| Hammer.JS, fork NAVER egjs, внутри vis | 2.0.17-rc | [MIT](licenses/Hammer-NAVER-MIT.txt) |
| Apache ECharts | 5.6.0 | [Apache 2.0 и перечень компонентов](licenses/echarts/LICENSE), [NOTICE](licenses/echarts/NOTICE) |
| ZRender, внутри ECharts | 5.6.1 | [BSD 3-Clause](licenses/ZRender-5.6.1-BSD.txt) |
| Фрагменты d3 внутри ECharts | согласно поставке ECharts | [BSD 3-Clause](licenses/echarts/LICENSE-d3) |
| Вспомогательный код Microsoft / tslib | 2.3.0 | [0BSD](licenses/tslib-2.3.0-0BSD.txt) |

[Уведомления из встроенного JavaScript](licenses/EMBEDDED-NOTICES.txt) сохранены отдельно. Основные библиотеки уже включены в `МакетJS`; CSS vis — в `МакетHTML`. Файлы `sourceMappingURL` удалены при встраивании; остальной код библиотек не изменялся. Версии, источники и контрольные суммы перечислены в [vendor-manifest.json](EPF/scheduler4000/vendor-manifest.json).

Первичные источники дополнительных текстов лицензий: [Moment 2.29.4](https://github.com/moment/moment/blob/2.29.4/LICENSE), [NAVER Hammer](https://github.com/naver/hammer.js/blob/master/LICENSE.md), [ZRender 5.6.1](https://github.com/ecomfe/zrender/blob/5.6.1/LICENSE), [tslib 2.3.0](https://github.com/microsoft/tslib/blob/2.3.0/LICENSE.txt). Лицензии vis и ECharts взяты из пакетов версий, указанных в манифесте.

Платформа 1С, прикладные конфигурации и информационная база в поставку не входят.
