export function friendlyAiError(message: string) {
  if (/api key|authentication|401/i.test(message)) {
    return '模型密钥无效，请到设置里检查。'
  }
  if (/connection error|ECONNREFUSED|fetch failed/i.test(message)) {
    return '连不上模型服务，请稍后重试。'
  }
  return message
}
