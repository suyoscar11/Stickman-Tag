export default class CurrencyManager {
    constructor() {
        this.coins = parseInt(localStorage.getItem('stickman_coins')) || 0;
        this.unlockedSkins = JSON.parse(localStorage.getItem('stickman_skins')) || ['default'];
        this.activeSkin = localStorage.getItem('stickman_active_skin') || 'default';
    }

    addCoins(amount) {
        this.coins += amount;
        this.save();
    }

    buySkin(skinId, price) {
        if (this.coins >= price && !this.unlockedSkins.includes(skinId)) {
            this.coins -= price;
            this.unlockedSkins.push(skinId);
            this.save();
            return true;
        }
        return false;
    }

    save() {
        localStorage.setItem('stickman_coins', this.coins);
        localStorage.setItem('stickman_skins', JSON.stringify(this.unlockedSkins));
        localStorage.setItem('stickman_active_skin', this.activeSkin);
    }
}