import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async () => ({
  locale: 'en-AU',
  messages: {},
  formats: {
    number: {
      currency: { style: 'currency', currency: 'AUD', minimumFractionDigits: 0 },
    },
    dateTime: {
      short: { day: 'numeric', month: 'short', year: 'numeric' },
    },
  },
}));
