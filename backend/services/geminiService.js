const conditionValues = new Set(['NEW', 'LIKE_NEW', 'USED', 'OLD']);
const damageValues = new Set(['LOW', 'MEDIUM', 'HIGH']);

const parseAssessment = (text) => {
  let assessment;
  try {
    assessment = JSON.parse(text);
  } catch {
    const error = new Error('Gemini trả về kết quả không đọc được. Vui lòng thử lại.');
    error.statusCode = 502;
    throw error;
  }

  if (
    !assessment ||
    !conditionValues.has(assessment.condition) ||
    !damageValues.has(assessment.damageLevel) ||
    typeof assessment.damageNotes !== 'string' ||
    !Number.isFinite(Number(assessment.estimatedPrice)) ||
    Number(assessment.estimatedPrice) < 0 ||
    Number(assessment.estimatedPrice) > 100000000 ||
    !Number.isFinite(Number(assessment.confidence)) ||
    Number(assessment.confidence) < 0 ||
    Number(assessment.confidence) > 1
  ) {
    const error = new Error('Gemini trả về đánh giá không hợp lệ. Vui lòng thử lại.');
    error.statusCode = 502;
    throw error;
  }

  return {
    condition: assessment.condition,
    damageLevel: assessment.damageLevel,
    damageNotes: assessment.damageNotes.trim().slice(0, 300),
    estimatedPrice: Math.round(Number(assessment.estimatedPrice) / 1000) * 1000,
    confidence: Number(assessment.confidence),
    provider: 'Gemini',
    analyzedAt: new Date()
  };
};

module.exports = async ({ image, mimeType, title, author, coverPrice }) => {
  if (!process.env.GEMINI_API_KEY) {
    const error = new Error('Chưa cấu hình GEMINI_API_KEY trong backend/.env.');
    error.statusCode = 503;
    throw error;
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  let response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY
      },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              text: `Đánh giá ảnh sách cũ để hỗ trợ người đăng. Không suy đoán những gì ảnh không thể chứng minh; một ảnh không đủ xác nhận mọi trang bên trong. Sách: "${title}", tác giả: "${author || 'chưa rõ'}", giá bìa người đăng khai báo: ${coverPrice} VND. Trả lời duy nhất JSON với schema: {"condition":"NEW|LIKE_NEW|USED|OLD","damageLevel":"LOW|MEDIUM|HIGH","damageNotes":"mô tả ngắn bằng tiếng Việt","estimatedPrice":số nguyên VND hợp lý dựa trên ảnh, giá bìa và tình trạng quan sát được,"confidence":số từ 0 đến 1}. Đây chỉ là ước tính tham khảo, không phải thẩm định chuyên nghiệp.`
            },
            { inline_data: { mime_type: mimeType, data: image.toString('base64') } }
          ]
        }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
      })
    });
  } catch (requestError) {
    const error = new Error(requestError.name === 'TimeoutError'
      ? 'Gemini mất quá nhiều thời gian để phân tích. Vui lòng thử lại.'
      : 'Không thể kết nối dịch vụ Gemini. Vui lòng thử lại sau.');
    error.statusCode = requestError.name === 'TimeoutError' ? 504 : 502;
    throw error;
  }

  if (!response.ok) {
    const error = new Error(response.status === 429
      ? 'Gemini đang giới hạn yêu cầu. Vui lòng thử lại sau.'
      : 'Dịch vụ Gemini không thể phân tích ảnh lúc này.');
    error.statusCode = response.status === 429 ? 503 : 502;
    throw error;
  }

  let result;
  try {
    result = await response.json();
  } catch {
    const error = new Error('Gemini trả về phản hồi không hợp lệ.');
    error.statusCode = 502;
    throw error;
  }
  const text = result.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
  if (!text) {
    const error = new Error('Gemini không trả về kết quả phân tích ảnh.');
    error.statusCode = 502;
    throw error;
  }
  return parseAssessment(text);
};
