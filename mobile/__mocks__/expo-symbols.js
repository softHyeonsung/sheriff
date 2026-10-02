// 테스트에서는 아이콘 그림이 필요 없다: 빈 뷰로 대신한다(네이티브 기호·글꼴을 부르지 않게).
const React = require('react');
const { View } = require('react-native');

module.exports = { SymbolView: () => React.createElement(View, { testID: 'icon' }) };
