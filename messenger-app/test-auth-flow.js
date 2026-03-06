async function testAuthFlow() {
  try {
    console.log('1. Testing login...');
    const loginResponse = await fetch('http://localhost:8080/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@test.com',
        password: 'test123'
      })
    });
    
    if (!loginResponse.ok) {
      console.error('Login failed:', loginResponse.status);
      const error = await loginResponse.json();
      console.error('Error:', error);
      return;
    }
    
    const loginData = await loginResponse.json();
    console.log('✅ Login successful!');
    console.log('Access token:', loginData.accessToken.substring(0, 50) + '...');
    
    console.log('\n2. Testing /api/auth/me...');
    const meResponse = await fetch('http://localhost:8080/api/auth/me', {
      headers: { 'Authorization': `Bearer ${loginData.accessToken}` }
    });
    
    if (!meResponse.ok) {
      console.error('/me failed:', meResponse.status);
      const error = await meResponse.json();
      console.error('Error:', error);
      return;
    }
    
    const meData = await meResponse.json();
    console.log('✅ /me works!');
    console.log('User:', meData.username);
    
    console.log('\n3. Testing refresh...');
    const refreshResponse = await fetch('http://localhost:8080/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: loginData.refreshToken })
    });
    
    if (!refreshResponse.ok) {
      console.error('Refresh failed:', refreshResponse.status);
      const error = await refreshResponse.json();
      console.error('Error:', error);
      return;
    }
    
    const refreshData = await refreshResponse.json();
    console.log('✅ Refresh works!');
    console.log('New access token:', refreshData.accessToken.substring(0, 50) + '...');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testAuthFlow();
