import { app } from './app';
import { env } from './config/env';

const server = app.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
});

export default server;
