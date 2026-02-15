import adapterAuto from '@sveltejs/adapter-auto';
import adapterVercel from '@sveltejs/adapter-vercel';

const env = process.env.APP_ENV;

export default {
	kit: {
		adapter: env === 'production' || env === 'staging' ? adapterVercel() : adapterAuto()
	}
};
