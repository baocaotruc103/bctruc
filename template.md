flowchart TD
    A[WebApp Báo cáo trực] --> B[1. Danh sách BN]
    A --> C[2. Báo cáo khoa]
    A --> D[3. Báo cáo Khối]
    A --> E[4. Báo cáo Chỉ huy]
    A --> F[5. User]
    A --> G[6. Danh mục]

    G --> G1[Danh mục đơn vị]

    B --> B1[Nhập thông tin bệnh nhân]
    B1 --> B2[Thêm diễn biến]
    B2 --> B21[Ngày diễn biến]
    B2 --> B22[Diễn biến lâm sàng]
    B2 --> B23[Diễn biến cận lâm sàng]
    B2 --> B24[Can thiệp]
    B2 --> B25[Ghi chú]

    B --> B3[Xem chi tiết bệnh nhân]
    B3 --> B31[Thông tin ban đầu]
    B3 --> B32[Nhật ký diễn biến bệnh nhân]

    C --> C1[Tạo báo cáo khoa]
    C1 --> C11[Nhập thông tin ca trực]
    C1 --> C12[Nhập số liệu trong ngày]
    C1 --> C13[Thêm bệnh nhân vào báo cáo]

    C13 --> C131[Chọn từ danh sách BN đang điều trị]
    C13 --> C132[BN trạng thái khác đang điều trị]
    C132 --> C133{Ngày kết thúc}
    C133 -->|Bằng ngày hiện tại| C134[Hiển thị để chọn]
    C133 -->|Trong vòng 3 ngày gần nhất| C134
    C133 -->|Quá 3 ngày| C135[Không hiển thị]

    D --> D1[Danh sách báo cáo Khối]
    D --> D2[Tạo báo cáo Khối]
    D2 --> D21[Tổng hợp từ báo cáo khoa]
    D21 --> D22[Điều kiện: ngày báo cáo Khối = ngày báo cáo khoa]
    D --> D3[Xem chi tiết theo mẫu]

    E --> E1[Danh sách báo cáo Chỉ huy]
    E --> E2[Tạo báo cáo Chỉ huy]
    E2 --> E21[Tổng hợp từ báo cáo khoa/khối]
    E21 --> E22[Điều kiện: ngày báo cáo Chỉ huy = ngày báo cáo khoa]
    E --> E3[Xem chi tiết theo mẫu]

    flowchart LR
    A[Danh sách bệnh nhân] --> B[Quản lý thông tin BN]
    B --> C[Theo dõi diễn biến]
    C --> D[Chọn BN đưa vào báo cáo khoa]
    D --> E[Báo cáo khoa]
    E --> F[Báo cáo Khối]
    E --> G[Báo cáo Chỉ huy]

    flowchart TD
    A[Thêm bệnh nhân vào báo cáo khoa] --> B{Trạng thái BN}
    B -->|Đang điều trị| C[Hiển thị trong danh sách chọn]
    B -->|Khác đang điều trị| D{Ngày kết thúc điều trị}
    D -->|Ngày hiện tại| C
    D -->|Trong vòng 3 ngày gần nhất| C
    D -->|Quá 3 ngày| E[Không hiển thị]