export default {
  port: 8787,
  authUrl: 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
  apiBaseUrl: 'https://gigachat.devices.sberbank.ru/api/v1',
  scope: 'GIGACHAT_API_PERS',
  model: 'GigaChat',
  authKey: '', // безопасный вариант: хранить ключ не здесь, а в .env.local
};
