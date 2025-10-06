/*
  # AI Voice Assistant Settings Schema

  1. New Tables
    - `assistant_settings`
      - `id` (uuid, primary key) - Unique identifier for settings
      - `user_id` (uuid) - Reference to auth.users
      - `name` (text) - Configuration name/label
      - `system_message` (text) - AI personality prompt
      - `voice` (text) - OpenAI voice selection
      - `temperature` (decimal) - Response randomness (0-1)
      - `initial_greeting` (text) - First message to caller
      - `enable_greeting` (boolean) - Toggle greeting on/off
      - `openai_api_key` (text) - Encrypted API key
      - `twilio_account_sid` (text) - Twilio credentials
      - `twilio_auth_token` (text) - Twilio auth token
      - `twilio_phone_number` (text) - Twilio phone number
      - `ngrok_auth_token` (text) - ngrok auth token
      - `is_active` (boolean) - Currently active configuration
      - `created_at` (timestamptz) - Creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp
    
    - `call_logs`
      - `id` (uuid, primary key) - Unique log identifier
      - `user_id` (uuid) - Reference to auth.users
      - `call_sid` (text) - Twilio call SID
      - `from_number` (text) - Caller phone number
      - `to_number` (text) - Destination number
      - `duration` (integer) - Call duration in seconds
      - `status` (text) - Call status
      - `started_at` (timestamptz) - Call start time
      - `ended_at` (timestamptz) - Call end time
      - `transcript` (text) - Call transcript
      - `created_at` (timestamptz) - Log creation timestamp

  2. Security
    - Enable RLS on all tables
    - Users can only access their own settings and logs
    - Authenticated users can CRUD their own data
*/

-- Create assistant_settings table
CREATE TABLE IF NOT EXISTS assistant_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Default Configuration',
  system_message text DEFAULT 'You are a helpful and bubbly AI assistant who loves to chat about anything the user is interested about and is prepared to offer them facts.',
  voice text DEFAULT 'alloy',
  temperature decimal(3,2) DEFAULT 0.8,
  initial_greeting text DEFAULT 'Hello! How can I help you today?',
  enable_greeting boolean DEFAULT true,
  openai_api_key text,
  twilio_account_sid text,
  twilio_auth_token text,
  twilio_phone_number text,
  ngrok_auth_token text,
  is_active boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create call_logs table
CREATE TABLE IF NOT EXISTS call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  call_sid text,
  from_number text,
  to_number text,
  duration integer DEFAULT 0,
  status text DEFAULT 'initiated',
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  transcript text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE assistant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;

-- assistant_settings policies
CREATE POLICY "Users can view own settings"
  ON assistant_settings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
  ON assistant_settings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON assistant_settings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own settings"
  ON assistant_settings FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- call_logs policies
CREATE POLICY "Users can view own call logs"
  ON call_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own call logs"
  ON call_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own call logs"
  ON call_logs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own call logs"
  ON call_logs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_assistant_settings_user_id ON assistant_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_assistant_settings_is_active ON assistant_settings(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_call_logs_user_id ON call_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_created_at ON call_logs(user_id, created_at DESC);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for assistant_settings
DROP TRIGGER IF EXISTS update_assistant_settings_updated_at ON assistant_settings;
CREATE TRIGGER update_assistant_settings_updated_at
  BEFORE UPDATE ON assistant_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
