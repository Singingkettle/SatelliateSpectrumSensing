import React from 'react';
import { Radio } from 'antd';
import { useTranslation } from 'react-i18next';

const LanguageSelector = () => {
  const { i18n } = useTranslation();

  const handleLanguageChange = (e) => {
    i18n.changeLanguage(e.target.value);
  };

  return (
    <div style={{ padding: '10px 20px', borderBottom: '1px solid #3e3e42' }}>
      <Radio.Group value={i18n.language} onChange={handleLanguageChange} size="small">
        <Radio.Button value="zh">中文</Radio.Button>
        <Radio.Button value="en">English</Radio.Button>
      </Radio.Group>
    </div>
  );
};

export default LanguageSelector;
