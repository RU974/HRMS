import { FormInput } from "./form-input";
export function DatePicker(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <FormInput type="date" {...props} />;
}


