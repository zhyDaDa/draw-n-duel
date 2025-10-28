import { Button, Form, InputNumber, Typography } from "antd";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSettings } from "../context/SettingsContext";
import "../App.css";

interface SettingsFormValues {
  soloAiCount: number;
}

const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { settings, updateSettings, resetSettings } = useSettings();
  const [form] = Form.useForm<SettingsFormValues>();

  useEffect(() => {
    form.setFieldsValue({
      soloAiCount: settings.soloAiCount,
    });
  }, [form, settings.soloAiCount]);

  const handleFinish = (values: SettingsFormValues) => {
    updateSettings(values);
    navigate(-1);
  };

  return (
    <div className="settings-page">
      <div className="settings-page__card">
        <Typography.Title level={2}>游戏设置</Typography.Title>
        <Typography.Paragraph>
          当前仅支持配置单人模式下的 AI 数量，后续将提供更多选项。
        </Typography.Paragraph>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleFinish}
          initialValues={{ soloAiCount: settings.soloAiCount }}
        >
          <Form.Item
            label="单人模式的 AI 数量"
            name="soloAiCount"
            rules={[{ required: true, message: "请输入 AI 数量" }]}
          >
            <InputNumber min={0} max={4} style={{ width: "100%" }} />
          </Form.Item>
          <div className="settings-page__actions">
            <Button onClick={() => navigate(-1)}>返回</Button>
            <Button type="default" onClick={resetSettings}>
              重置默认
            </Button>
            <Button type="primary" htmlType="submit">
              保存
            </Button>
          </div>
        </Form>
      </div>
    </div>
  );
};

export default SettingsPage;
