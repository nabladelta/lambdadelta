import { GroupDataProvider } from "./providers/dataProvider"
import { FileProvider } from "./providers/file"

class Lambda {
    public provider: GroupDataProvider
    
    private constructor(provider: GroupDataProvider) {
        this.provider = provider
    }
    public static async load() {
        return new Lambda(await FileProvider.load())
    }
}