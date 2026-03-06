async function testSendMessage() {
  try {
    console.log('🚀 Testing send message...\n');
    
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
    console.log('\n📝 Sending message...');
    const sendResponse = await fetch(`http://localhost:8080/api/chats/${chatId}/messages`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: 'Test message from API ' + new Date().toISOString(),
        type: 'text'
      })
    });
    
    if (sendResponse.ok) {
      const message = await sendResponse.json();
      console.log('✅ Message sent successfully!');
      console.log('Message ID:', message.id);
      console.log('Content:', message.content);
    } else {
      const error = await sendResponse.json();
      console.log('❌ Send message failed:', sendResponse.status);
      console.log('Error:', error);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testSendMessage();
