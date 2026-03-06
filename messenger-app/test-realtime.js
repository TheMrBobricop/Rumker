async function testRealTimeMessages() {
  try {
    console.log('🚀 Testing real-time messages...\n');
    
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
    console.log('✅ Logged in');
    
    // Получаем чаты
    const chatsResponse = await fetch('http://localhost:8080/api/chats', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const chats = await chatsResponse.json();
    if (chats.length === 0) {
      console.log('❌ No chats found');
      return;
    }
    
    const chatId = chats[0].id;
    console.log(`✅ Using chat: ${chatId}`);
    
    // Отправляем сообщение
    console.log('\n📝 Sending message via API...');
    const sendResponse = await fetch(`http://localhost:8080/api/chats/${chatId}/messages`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: 'Real-time test message ' + new Date().toISOString(),
        type: 'text'
      })
    });
    
    if (sendResponse.ok) {
      const message = await sendResponse.json();
      console.log('✅ Message sent via API!');
      console.log('Message ID:', message.id);
      console.log('Content:', message.content);
    } else {
      const error = await sendResponse.json();
      console.log('❌ Send failed:', sendResponse.status, error);
    }
    
    // Проверяем сообщения
    console.log('\n📋 Checking messages...');
    const messagesResponse = await fetch(`http://localhost:8080/api/chats/${chatId}/messages?limit=10`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (messagesResponse.ok) {
      const messages = await messagesResponse.json();
      console.log(`✅ Found ${messages.length} messages`);
      messages.forEach((msg, i) => {
        console.log(`  ${i + 1}. ${msg.content} (${new Date(msg.timestamp).toLocaleTimeString()})`);
      });
    } else {
      console.log('❌ Failed to get messages');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testRealTimeMessages();
