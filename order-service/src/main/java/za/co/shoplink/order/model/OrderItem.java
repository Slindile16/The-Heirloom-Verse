package za.co.shoplink.order.model;

import java.math.BigDecimal;
import java.util.Currency;

public record OrderItem(String productId, String productName, int quantity, BigDecimal unitPrice, Currency currency,
                        BigDecimal originalUnitPrice) {
    public OrderItem(String productId, String productName, int quantity, BigDecimal unitPrice, Currency currency) {
        this(productId, productName, quantity, unitPrice, currency, unitPrice);
    }
}
