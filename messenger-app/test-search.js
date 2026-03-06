async function testUserSearch() {
  try {
    // Логинимся
    const loginResponse = await fetch('http://localhost:8080/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@test.com',
        password: 'test123'
      })
    });
    
    const loginData = await loginResponse.json();
    const token = loginData.accessToken;
    
    // Пробуем разные поисковые запросы
    const searches = ['test', 'testuser', 'testuser2', 'user'];
    
    for (const query of searches) {
      console.log(`\nSearching for: "${query}"`);
      
      const response = await fetch(`http://localhost:8080/api/users/search?q=${query}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const users = await response.json();
        console.log(`✅ Response type:`, typeof users);
        console.log(`✅ Response:`, users);
        
        if (Array.isArray(users)) {
          console.log(`✅ Found ${users.length} users:`, users.map(u => u.username));
        } else {
          console.log(`❌ Response is not array:`, users);
        }
      } else {
        console.log(`❌ Search failed:`, response.status);
        const error = await response.json();
        console.log('Error:', error);
      }
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testUserSearch();
