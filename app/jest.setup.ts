// Tests run in plain Node where `EXPO_PUBLIC_HOSTED_API_URL` isn't injected.
// Pin it to a neutral example origin so `MAIN_HOSTED_SERVER_URL` resolves
// deterministically (fixtures use this same host for the "Chara Cloud" server).
process.env.EXPO_PUBLIC_HOSTED_API_URL = 'https://api.example.com';
